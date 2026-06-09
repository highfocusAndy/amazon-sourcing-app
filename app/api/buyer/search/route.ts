import { NextRequest, NextResponse } from "next/server";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { searchBuyerCatalog, isPaApiConfigured, type BuyerCatalogItem } from "@/lib/paApiClient";
import { prisma } from "@/lib/db";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { userBuyerSearchLimit } from "@/lib/apiRateLimit";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ITEM_PAGE = 10;

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
  bestsellers: "Featured",
  price_asc: "Price:LowToHigh",
  price_desc: "Price:HighToLow",
  rating: "AvgCustomerReviews",
  newest: "NewestArrivals",
};

const GLOBAL_SEEDS = [
  "best sellers",
  "top rated",
  "popular items",
  "trending now",
  "new arrivals",
  "deals",
  "top picks",
  "highly rated",
  "must have",
  "customer favorites",
  "gift ideas",
  "hot new releases",
  "bestselling products",
  "featured products",
  "everyday essentials",
];

const CATEGORY_SEEDS: Record<string, string[]> = {
  Electronics: ["popular electronics", "headphones", "phones", "computers", "cameras", "smart home", "gaming gear", "wearables", "tv audio", "best electronics"],
  "Home & Kitchen": ["popular home", "cookware", "furniture", "bedding", "bathroom", "storage", "decor", "appliances", "vacuums", "best home kitchen"],
  "Beauty & Personal Care": ["popular beauty", "makeup", "skincare", "hair care", "fragrance", "men's grooming", "beauty tools", "bath body", "best beauty"],
  "Sports & Outdoors": ["popular sports", "fitness equipment", "outdoor gear", "cycling", "camping", "water sports", "running gear", "yoga"],
  "Toys & Games": ["popular toys", "board games", "puzzles", "action figures", "building sets", "dolls", "educational toys"],
  Books: ["bestseller books", "fiction", "non-fiction", "children's books", "self-help", "business books"],
  Clothing: ["popular clothing", "men's clothing", "women's clothing", "kids clothing", "shoes", "activewear", "jewelry"],
  "Pet Supplies": ["popular pet", "dog supplies", "cat supplies", "fish aquarium", "bird supplies", "pet food", "pet toys"],
  Automotive: ["car accessories", "car tools", "car interior", "car electronics", "best automotive"],
  "Office Products": ["office supplies", "pens writing", "desk organization", "office furniture", "office tech"],
};

function expandKeyword(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  if (q.endsWith("s") && q.length > 3) variants.add(q.slice(0, -1));
  else variants.add(`${q}s`);

  const prefixes = ["best", "popular", "top", "new", "premium", "men's", "women's", "kids"];
  for (const p of prefixes) variants.add(`${p} ${q}`);

  const suffixes = ["for men", "for women", "for kids", "set", "bundle", "gift"];
  for (const s of suffixes) variants.add(`${q} ${s}`);

  return Array.from(variants);
}

type Cursor = {
  s: number;
  p: number;
  c?: number;
};

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof decoded.s === "number" && typeof decoded.p === "number") {
      return { s: decoded.s, p: decoded.p, c: typeof decoded.c === "number" ? decoded.c : 0 };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isPaApiConfigured()) {
    return NextResponse.json({ error: "Product catalog is not available. PA-API credentials required." }, { status: 503 });
  }
  if (!(await isBuyerModeEnabled())) {
    return NextResponse.json({ error: "Buyer mode is not enabled." }, { status: 403 });
  }
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;
  if (!(await userBuyerSearchLimit(gate.userId))) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const keyword = (sp.get("keyword") ?? "").trim();
  const category = sp.get("category") ?? "";
  const subcategory = (sp.get("subcategory") ?? "").trim();
  const sortKey = sp.get("sort") ?? "";
  const minPrice = parseFloat(sp.get("minPrice") ?? "0") || 0;
  const maxPrice = parseFloat(sp.get("maxPrice") ?? "0") || 0;
  const minRating = parseFloat(sp.get("minRating") ?? "0") || 0;
  const brandFilter = (sp.get("brand") ?? "").trim().toLowerCase();
  const bsrMax = parseInt(sp.get("bsrMax") ?? "0", 10) || 0;
  const primeOnly = sp.get("primeOnly") === "true";
  const audience = (sp.get("audience") ?? "").trim().toLowerCase();
  const incomingCursor = decodeCursor(sp.get("pageToken") ?? "");

  const searchIndex = CATEGORY_TO_SEARCH_INDEX[category] ?? "All";
  const sortBy = SORT_MAP[sortKey] ?? undefined;

  const userPrimary = [audience, keyword, subcategory].filter(Boolean).join(" ").trim();
  const browseMode = !userPrimary;

  const seedList: string[] = browseMode
    ? (category && CATEGORY_SEEDS[category] ? CATEGORY_SEEDS[category] : GLOBAL_SEEDS)
    : expandKeyword(userPrimary);

  let seedCycle = incomingCursor?.c ?? 0;
  let seedIndex = incomingCursor?.s ?? 0;
  const itemPage = incomingCursor?.p ?? 1;

  if (seedIndex >= seedList.length) {
    if (browseMode) { seedIndex = 0; seedCycle += 1; }
    else seedIndex = Math.max(0, seedList.length - 1);
  }

  const currentSeed = seedList[seedIndex] ?? seedList[0];

  const cacheKey = `buyer:pa:v1:${searchIndex}:${encodeURIComponent(currentSeed)}:${seedIndex}:${itemPage}:${seedCycle}:${sortBy ?? ""}`;

  try {
    const cached = await prisma.apiResponseCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      const raw = JSON.parse(cached.payload) as { items: BuyerCatalogItem[]; nextPageToken: string | null };
      const filtered = postFilter(raw.items, { minPrice, maxPrice, minRating, bsrMax, primeOnly, brandFilter });
      return NextResponse.json({ ok: true, items: filtered, nextPageToken: raw.nextPageToken, fromCache: true });
    }
  } catch { /* ignore */ }

  const result = await searchBuyerCatalog({
    keyword: currentSeed,
    searchIndex,
    sortBy,
    maxResults: 10,
    itemPage,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const items = result.data.items;

  let nextCursor: Cursor | null;
  if (items.length > 0 && itemPage < MAX_ITEM_PAGE) {
    nextCursor = { s: seedIndex, p: itemPage + 1, c: seedCycle };
  } else {
    const nextSeed = seedIndex + 1;
    if (nextSeed >= seedList.length) {
      nextCursor = browseMode ? { s: 0, p: 1, c: seedCycle + 1 } : null;
    } else {
      nextCursor = { s: nextSeed, p: 1, c: seedCycle };
    }
  }

  const nextPageToken = nextCursor ? encodeCursor(nextCursor) : null;

  try {
    await prisma.apiResponseCache.upsert({
      where: { cacheKey },
      update: { payload: JSON.stringify({ items, nextPageToken }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
      create: { cacheKey, payload: JSON.stringify({ items, nextPageToken }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
    });
  } catch { /* ignore */ }

  const filtered = postFilter(items, { minPrice, maxPrice, minRating, bsrMax, primeOnly, brandFilter });
  return NextResponse.json({ ok: true, items: filtered, nextPageToken });
}

function postFilter(
  items: BuyerCatalogItem[],
  opts: {
    minPrice: number;
    maxPrice: number;
    minRating: number;
    bsrMax: number;
    primeOnly: boolean;
    brandFilter: string;
  },
): BuyerCatalogItem[] {
  return items.filter((item) => {
    if (opts.minPrice > 0 && (item.price == null || item.price < opts.minPrice)) return false;
    if (opts.maxPrice > 0 && (item.price == null || item.price > opts.maxPrice)) return false;
    if (opts.minRating > 0 && (item.starRating == null || item.starRating < opts.minRating)) return false;
    if (opts.bsrMax > 0 && (item.salesRank == null || item.salesRank > opts.bsrMax)) return false;
    if (opts.primeOnly && item.isPrime !== true) return false;
    if (opts.brandFilter && !item.brand.toLowerCase().includes(opts.brandFilter)) return false;
    return true;
  });
}
