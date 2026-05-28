import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { searchBuyerCatalog, fetchCatalogItemsFromPaApi } from "@/lib/paApiClient";
import { searchBuyerCatalogSpApi, fetchOffersForAsin, type ItemCondition } from "@/lib/sp-api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TARGET_PAGE_SIZE = 50;
const SP_API_MAX_PAGE = 20;

const CATEGORY_TO_SEARCH_INDEX: Record<string, string> = {
  Electronics: "Electronics",
  "Home & Kitchen": "HomeGarden",
  "Beauty & Personal Care": "Beauty",
  "Sports & Outdoors": "SportingGoods",
  "Toys & Games": "ToysAndGames",
  Books: "Books",
  Clothing: "Fashion",
  "Pet Supplies": "PetSupplies",
  Automotive: "Automotive",
  "Office Products": "OfficeProducts",
};

const SORT_MAP: Record<string, string> = {
  relevance: "Relevance",
  price_asc: "Price:LowToHigh",
  price_desc: "Price:HighToLow",
  rating: "AvgCustomerReviews",
  bestsellers: "Relevance",
  newest: "NewestArrivals",
};

// Continuation seeds — when SP-API exhausts its native pagination for a given query, we transparently
// chain through variations so users see effectively endless results (Amazon-like infinite scroll).
const GLOBAL_SEEDS = [
  "best sellers",
  "top rated",
  "popular items",
  "amazon choice",
  "trending now",
  "new arrivals",
  "deals",
  "top picks",
  "highly rated",
  "must have",
];

const CATEGORY_SEEDS: Record<string, string[]> = {
  Electronics: ["popular electronics", "headphones", "phones", "computers", "cameras", "tv audio", "smart home", "gaming gear", "wearables", "best electronics"],
  "Home & Kitchen": ["popular home", "cookware", "furniture", "bedding", "bathroom", "storage", "decor", "appliances", "vacuums", "best home kitchen"],
  "Beauty & Personal Care": ["popular beauty", "makeup", "skincare", "hair care", "fragrance", "men's grooming", "beauty tools", "nail care", "bath body", "best beauty"],
  "Sports & Outdoors": ["popular sports", "fitness equipment", "outdoor gear", "cycling", "camping", "water sports", "hunting", "team sports", "running gear", "yoga"],
  "Toys & Games": ["popular toys", "board games", "puzzles", "action figures", "building sets", "dolls", "stuffed animals", "outdoor toys", "educational toys", "remote control"],
  Books: ["bestseller books", "fiction", "non-fiction", "children's books", "cookbooks", "self-help", "biography", "business books", "sci-fi fantasy", "mystery thriller"],
  Clothing: ["popular clothing", "men's clothing", "women's clothing", "kids clothing", "shoes", "accessories", "activewear", "jewelry", "watches", "bags"],
  "Pet Supplies": ["popular pet", "dog supplies", "cat supplies", "fish aquarium", "bird supplies", "small animals", "reptile supplies", "pet food", "pet toys", "pet grooming"],
  Automotive: ["car accessories", "car tools", "car interior", "car exterior", "car electronics", "tires wheels", "oil fluids", "motorcycle", "rv accessories", "best automotive"],
  "Office Products": ["office supplies", "paper", "pens writing", "desk organization", "office furniture", "office tech", "calendars", "school supplies", "art supplies", "best office"],
};

type RawItem = {
  asin?: string;
  price?: number | null;
  buyBoxPrice?: number | null;
  lowestPrice?: number | null;
  brand?: string;
  title?: string;
  starRating?: number | null;
  salesRank?: number | null;
  isPrime?: boolean;
  offerCount?: number;
};

type Cursor = {
  /** Index into the seed list when no user keyword was provided. -1 = still on the user's primary keyword. */
  s: number;
  /** SP-API pagination token within the current seed. */
  t: string | null;
};

/**
 * Generate on-topic variations of a user-supplied keyword so we can keep paginating
 * after SP-API exhausts its native results for the exact query. All variants still
 * contain the original term so results stay relevant.
 */
function expandKeyword(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  // Plural / singular flip.
  if (q.endsWith("s") && q.length > 3) variants.add(q.slice(0, -1));
  else variants.add(`${q}s`);

  // Demographic + qualifier prefixes that are universally on-topic.
  const prefixes = [
    "best",
    "popular",
    "top",
    "new",
    "cheap",
    "premium",
    "men's",
    "women's",
    "kids",
    "boys",
    "girls",
    "vintage",
    "modern",
  ];
  for (const p of prefixes) variants.add(`${p} ${q}`);

  // Demographic + qualifier suffixes.
  const suffixes = [
    "for men",
    "for women",
    "for kids",
    "for boys",
    "for girls",
    "set",
    "bundle",
    "pack",
    "deluxe",
    "professional",
    "gift",
  ];
  for (const s of suffixes) variants.add(`${q} ${s}`);

  return Array.from(variants);
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof decoded.s === "number" && (decoded.t === null || typeof decoded.t === "string")) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isBuyerModeEnabled())) {
    return NextResponse.json({ error: "Buyer mode is not enabled." }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const keyword = (sp.get("keyword") ?? "").trim();
  const category = sp.get("category") ?? "";
  const subcategory = (sp.get("subcategory") ?? "").trim();
  const sortKey = sp.get("sort") ?? "relevance";
  const minPrice = parseFloat(sp.get("minPrice") ?? "0") || 0;
  const maxPrice = parseFloat(sp.get("maxPrice") ?? "0") || 0;
  const minRating = parseFloat(sp.get("minRating") ?? "0") || 0;
  const brandFilter = (sp.get("brand") ?? "").trim().toLowerCase();
  const priceSource = sp.get("priceSource") === "lowest" ? "lowest" : "buybox";
  const bsrMax = parseInt(sp.get("bsrMax") ?? "0", 10) || 0;
  const primeOnly = sp.get("primeOnly") === "true";
  const audience = (sp.get("audience") ?? "").trim().toLowerCase();
  const conditionRaw = (sp.get("condition") ?? "new").toLowerCase();
  const condition: ItemCondition =
    conditionRaw === "used" || conditionRaw === "refurbished" || conditionRaw === "collectible"
      ? (conditionRaw as ItemCondition)
      : "new";
  const incomingCursor = decodeCursor(sp.get("pageToken") ?? "");

  const searchIndex = CATEGORY_TO_SEARCH_INDEX[category] ?? "All";
  const sortBy = SORT_MAP[sortKey];

  // Build the seed list used for continuation pagination.
  // - If the user typed a keyword (or picked a subcategory), expand it into on-topic
  //   variations only (e.g. "shirt" → "shirts", "men's shirt", "polo shirt"...) so
  //   results stay relevant while still allowing deep pagination.
  // - When no keyword and no subcategory, we walk through category-specific or global
  //   seeds to provide Amazon-like infinite browsing.
  const userPrimary = [audience, keyword, subcategory].filter(Boolean).join(" ").trim();
  const seedList: string[] = (() => {
    if (userPrimary) {
      return expandKeyword(userPrimary);
    }
    if (category && CATEGORY_SEEDS[category]) return CATEGORY_SEEDS[category];
    return GLOBAL_SEEDS;
  })();

  // Resume from incoming cursor, or start fresh at the first seed.
  let seedIndex = incomingCursor?.s ?? 0;
  let spApiToken: string | undefined = incomingCursor?.t ?? undefined;

  const cacheKey =
    `buyer:search:v9:${searchIndex}:${seedList[seedIndex] ?? ""}:${seedIndex}:${spApiToken ?? ""}:${sortKey}:${brandFilter}:${condition}`;

  // Cache hit fast path.
  try {
    const cached = await prisma.apiResponseCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      const raw = JSON.parse(cached.payload) as { items: unknown[]; nextPageToken: string | null };
      const filtered = postFilter(raw.items, { minPrice, maxPrice, minRating, priceSource, bsrMax, primeOnly });
      const sorted = sortItems(filtered, sortKey, priceSource);
      return NextResponse.json({ ok: true, items: sorted, nextPageToken: raw.nextPageToken, fromCache: true });
    }
  } catch { /* ignore */ }

  // Try PA-API only on the initial request (seed 0, no SP token) — purely opportunistic.
  const initialRequest = seedIndex === 0 && !spApiToken;
  let collected: unknown[] = [];
  let nextCursor: Cursor | null = null;

  if (initialRequest) {
    const paResult = await searchBuyerCatalog({
      keyword: seedList[0] || "best sellers",
      searchIndex,
      sortBy,
      maxResults: 10,
      itemPage: 1,
    });
    if (paResult.ok && paResult.data.items.length > 0) {
      collected.push(...(paResult.data.items as unknown[]));
    }
  }

  // SP-API: chain pages until we hit TARGET_PAGE_SIZE, walking through seeds when one runs dry.
  outer: while (collected.length < TARGET_PAGE_SIZE && seedIndex < seedList.length) {
    const currentSeed = seedList[seedIndex];
    const remaining = TARGET_PAGE_SIZE - collected.length;
    const pageSize = Math.min(SP_API_MAX_PAGE, remaining);

    const spResult = await searchBuyerCatalogSpApi({
      keyword: currentSeed,
      maxResults: pageSize,
      pageToken: spApiToken,
      brandNames: brandFilter ? [brandFilter] : undefined,
      condition,
    });

    if (!spResult.ok) {
      // If we already have items, return what we have; advance the seed so next request retries.
      if (collected.length > 0) {
        seedIndex += 1;
        spApiToken = undefined;
        nextCursor = seedIndex < seedList.length ? { s: seedIndex, t: null } : null;
        break outer;
      }
      // No items + first call failed → bubble up the error.
      return NextResponse.json({ error: spResult.error }, { status: 502 });
    }

    collected.push(...(spResult.data.items as unknown[]));
    spApiToken = spResult.data.nextToken;

    if (!spApiToken) {
      // Exhausted this seed → advance.
      seedIndex += 1;
    }
  }

  // Build the continuation cursor: either current seed + remaining spApiToken,
  // or the next seed if we exhausted this one mid-iteration.
  if (!nextCursor) {
    if (seedIndex < seedList.length) {
      nextCursor = { s: seedIndex, t: spApiToken ?? null };
    } else {
      nextCursor = null;
    }
  }

  // De-dupe by ASIN.
  const seen = new Set<string>();
  let items: Record<string, unknown>[] = collected
    .filter((i) => {
      const a = (i as { asin?: string }).asin;
      if (!a || seen.has(a)) return false;
      seen.add(a);
      return true;
    })
    .map((i) => ({ ...(i as Record<string, unknown>) }));

  // Price enrichment (when PA-API SearchItems returned items without prices).
  const missingPriceAsins = items
    .filter((i) => (i as RawItem).buyBoxPrice == null && (i as RawItem).price == null)
    .map((i) => (i as RawItem).asin)
    .filter((a): a is string => !!a);

  if (missingPriceAsins.length > 0) {
    const enriched = await fetchCatalogItemsFromPaApi(missingPriceAsins);
    if (enriched.ok) {
      const priceMap = new Map(enriched.data.map((ei) => [ei.asin, ei.price]));
      items = items.map((item) => {
        const i = item as RawItem;
        if (i.buyBoxPrice == null && i.asin && priceMap.has(i.asin)) {
          const p = priceMap.get(i.asin) ?? null;
          return { ...item, buyBoxPrice: p, price: p };
        }
        return item;
      });
    }

    const stillMissing = items
      .filter((i) => (i as RawItem).buyBoxPrice == null)
      .map((i) => (i as RawItem).asin)
      .filter((a): a is string => !!a);

    if (stillMissing.length > 0) {
      try {
        const offersList = await offersBatch(stillMissing, 8, condition);
        const offerMap = new Map(stillMissing.map((asin, idx) => [asin, offersList[idx]]));
        items = items.map((item) => {
          const i = item as RawItem;
          if (i.buyBoxPrice == null && i.asin && offerMap.has(i.asin)) {
            const o = offerMap.get(i.asin);
            const buyBox = o?.buyBoxPrice ?? null;
            const low = o?.lowestPrice ?? null;
            return {
              ...item,
              buyBoxPrice: buyBox,
              lowestPrice: low,
              price: buyBox ?? low,
              isPrime: o?.isPrime ?? (item.isPrime as boolean | undefined) ?? false,
              offerCount: o?.offerCount ?? (item.offerCount as number | undefined) ?? 0,
            };
          }
          return item;
        });
      } catch { /* best-effort */ }
    }
  }

  const nextPageToken = nextCursor ? encodeCursor(nextCursor) : null;

  // Quality gate: only cache pages where most items have usable prices.
  // SP-API offer fetches can throttle/fail transiently — caching a broken page
  // for an hour would surface "See price on Amazon" for everyone until expiry.
  const pricedCount = items.filter((i) => {
    const r = i as RawItem;
    return r.buyBoxPrice != null || r.lowestPrice != null || r.price != null;
  }).length;
  const priceCoverage = items.length === 0 ? 0 : pricedCount / items.length;
  const shouldCache = items.length === 0 || priceCoverage >= 0.5;

  if (shouldCache) {
    try {
      await prisma.apiResponseCache.upsert({
        where: { cacheKey },
        update: { payload: JSON.stringify({ items, nextPageToken }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
        create: { cacheKey, payload: JSON.stringify({ items, nextPageToken }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
      });
    } catch { /* ignore */ }
  }

  const filtered = postFilter(items, { minPrice, maxPrice, minRating, priceSource, bsrMax, primeOnly });
  const sorted = sortItems(filtered, sortKey, priceSource);
  return NextResponse.json({ ok: true, items: sorted, nextPageToken });
}

async function offersBatch(
  asins: string[],
  concurrency: number,
  condition: ItemCondition,
): Promise<Array<{ buyBoxPrice: number | null; lowestPrice: number | null; isPrime: boolean; offerCount: number } | null>> {
  const results: Array<{ buyBoxPrice: number | null; lowestPrice: number | null; isPrime: boolean; offerCount: number } | null> =
    new Array(asins.length).fill(null);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < asins.length) {
      const i = next;
      next += 1;
      try {
        const r = await fetchOffersForAsin(asins[i], condition);
        results[i] = {
          buyBoxPrice: r.buyBoxPrice,
          lowestPrice: r.lowestPrice,
          isPrime: r.isPrime,
          offerCount: r.offerCount,
        };
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, asins.length) }, () => worker()));
  return results;
}

function effectivePrice(item: RawItem, priceSource: "buybox" | "lowest"): number | null {
  if (priceSource === "lowest") {
    return item.lowestPrice ?? item.buyBoxPrice ?? item.price ?? null;
  }
  return item.buyBoxPrice ?? item.price ?? item.lowestPrice ?? null;
}

function postFilter(
  items: unknown[],
  opts: {
    minPrice: number;
    maxPrice: number;
    minRating: number;
    priceSource: "buybox" | "lowest";
    bsrMax: number;
    primeOnly: boolean;
  },
): Record<string, unknown>[] {
  return items
    .filter((item) => {
      const i = item as RawItem;
      const price = effectivePrice(i, opts.priceSource);
      if (opts.minPrice > 0 && (price == null || price < opts.minPrice)) return false;
      if (opts.maxPrice > 0 && (price == null || price > opts.maxPrice)) return false;
      if (opts.minRating > 0 && (i.starRating == null || i.starRating < opts.minRating)) return false;
      if (opts.bsrMax > 0 && (i.salesRank == null || i.salesRank > opts.bsrMax)) return false;
      if (opts.primeOnly && i.isPrime !== true) return false;
      return true;
    })
    .map((item) => {
      const i = item as RawItem;
      const price = effectivePrice(i, opts.priceSource);
      return { ...(item as Record<string, unknown>), price };
    });
}

function sortItems(items: unknown[], sortKey: string, priceSource: "buybox" | "lowest"): unknown[] {
  const arr = [...items];
  switch (sortKey) {
    case "price_asc":
      arr.sort((a, b) => {
        const pa = effectivePrice(a as RawItem, priceSource);
        const pb = effectivePrice(b as RawItem, priceSource);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb;
      });
      break;
    case "price_desc":
      arr.sort((a, b) => {
        const pa = effectivePrice(a as RawItem, priceSource);
        const pb = effectivePrice(b as RawItem, priceSource);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      });
      break;
    case "bestsellers":
      arr.sort((a, b) => {
        const ra = (a as RawItem).salesRank;
        const rb = (b as RawItem).salesRank;
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb;
      });
      break;
    case "rating":
      arr.sort((a, b) => {
        const ra = (a as RawItem).starRating ?? 0;
        const rb = (b as RawItem).starRating ?? 0;
        return rb - ra;
      });
      break;
    default:
      break;
  }
  return arr;
}
