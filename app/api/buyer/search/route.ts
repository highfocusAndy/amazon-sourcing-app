import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { searchBuyerCatalog, fetchCatalogItemsFromPaApi } from "@/lib/paApiClient";
import { searchBuyerCatalogSpApi, fetchOffersForAsin } from "@/lib/sp-api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TARGET_PAGE_SIZE = 50; // items returned per "page" to the UI
const SP_API_MAX_PAGE = 20; // SP-API hard cap per request

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
  bestsellers: "Relevance", // SP-API has no native bestseller sort; we sort in-memory by salesRank
  newest: "NewestArrivals",
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
};

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
  const startPageToken = sp.get("pageToken") ?? "";

  const searchIndex = CATEGORY_TO_SEARCH_INDEX[category] ?? "All";
  const sortBy = SORT_MAP[sortKey];

  // Best-sellers landing: when no keyword, no category, no subcategory — use a curated seed.
  const effectiveKeyword =
    [keyword, subcategory].filter(Boolean).join(" ") ||
    category ||
    "best sellers";

  const cacheKey = `buyer:search:v3:${searchIndex}:${effectiveKeyword}:${sortKey}:${startPageToken}:${brandFilter}`;

  // Cache hit fast path (filters applied after).
  try {
    const cached = await prisma.apiResponseCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      const raw = JSON.parse(cached.payload) as { items: unknown[]; nextPageToken: string | null };
      const filtered = postFilter(raw.items, {
        minPrice,
        maxPrice,
        minRating,
        priceSource,
        bsrMax,
        primeOnly,
      });
      const sorted = sortItems(filtered, sortKey, priceSource);
      return NextResponse.json({
        ok: true,
        items: sorted,
        nextPageToken: raw.nextPageToken,
        fromCache: true,
      });
    }
  } catch { /* ignore cache errors */ }

  // Try PA-API first (single 10-item page; 403 if Associates ineligibility).
  const paResult = await searchBuyerCatalog({
    keyword: effectiveKeyword,
    searchIndex,
    sortBy,
    maxResults: 10,
    itemPage: 1,
  });

  let collected: unknown[] = [];
  let nextPageToken: string | null = null;

  if (paResult.ok) {
    collected = paResult.data.items as unknown[];
  } else {
    // SP-API fallback. Chain pages until we reach TARGET_PAGE_SIZE or run out.
    let token: string | undefined = startPageToken || undefined;
    while (collected.length < TARGET_PAGE_SIZE) {
      const remaining = TARGET_PAGE_SIZE - collected.length;
      const pageSize = Math.min(SP_API_MAX_PAGE, remaining);
      const spResult = await searchBuyerCatalogSpApi({
        keyword: effectiveKeyword,
        maxResults: pageSize,
        pageToken: token,
        brandNames: brandFilter ? [brandFilter] : undefined,
      });
      if (!spResult.ok) {
        if (collected.length === 0) {
          return NextResponse.json({ error: spResult.error }, { status: 502 });
        }
        break; // partial results still useful
      }
      collected.push(...(spResult.data.items as unknown[]));
      token = spResult.data.nextToken;
      if (!token) break;
    }
    nextPageToken = token ?? null;
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

  // PA-API SearchItems rarely returns offer/price data — enrich for any items missing buy box.
  const missingPriceAsins = items
    .filter((i) => (i as RawItem).buyBoxPrice == null && (i as RawItem).price == null)
    .map((i) => (i as RawItem).asin)
    .filter((a): a is string => !!a);

  if (missingPriceAsins.length > 0) {
    // 1) PA-API GetItems batch enrichment (single price field).
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

    // 2) SP-API individual offers — populates buyBoxPrice AND lowestPrice.
    const stillMissing = items
      .filter((i) => (i as RawItem).buyBoxPrice == null)
      .map((i) => (i as RawItem).asin)
      .filter((a): a is string => !!a);

    if (stillMissing.length > 0) {
      try {
        const offersList = await offersBatch(stillMissing, 8);
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
            };
          }
          return item;
        });
      } catch { /* best-effort */ }
    }
  }

  // Persist to cache (raw items + nextPageToken).
  try {
    await prisma.apiResponseCache.upsert({
      where: { cacheKey },
      update: {
        payload: JSON.stringify({ items, nextPageToken }),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
      create: {
        cacheKey,
        payload: JSON.stringify({ items, nextPageToken }),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS),
      },
    });
  } catch { /* ignore cache write errors */ }

  const filtered = postFilter(items, { minPrice, maxPrice, minRating, priceSource, bsrMax, primeOnly });
  const sorted = sortItems(filtered, sortKey, priceSource);
  return NextResponse.json({ ok: true, items: sorted, nextPageToken });
}

async function offersBatch(
  asins: string[],
  concurrency: number,
): Promise<Array<{ buyBoxPrice: number | null; lowestPrice: number | null; isPrime: boolean } | null>> {
  const results: Array<{ buyBoxPrice: number | null; lowestPrice: number | null; isPrime: boolean } | null> =
    new Array(asins.length).fill(null);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < asins.length) {
      const i = next;
      next += 1;
      try {
        const r = await fetchOffersForAsin(asins[i]);
        results[i] = { buyBoxPrice: r.buyBoxPrice, lowestPrice: r.lowestPrice, isPrime: r.isPrime };
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
