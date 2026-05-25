import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBuyerModeEnabled } from "@/lib/featureFlags";
import { searchBuyerCatalog } from "@/lib/paApiClient";
import { searchBuyerCatalogSpApi } from "@/lib/sp-api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  const keyword = sp.get("keyword") ?? "";
  const category = sp.get("category") ?? "";
  const sortKey = sp.get("sort") ?? "relevance";
  const minPrice = parseFloat(sp.get("minPrice") ?? "0") || 0;
  const maxPrice = parseFloat(sp.get("maxPrice") ?? "0") || 0;
  const minRating = parseFloat(sp.get("minRating") ?? "0") || 0;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));

  const searchIndex = CATEGORY_TO_SEARCH_INDEX[category] ?? "All";
  const sortBy = SORT_MAP[sortKey];
  const effectiveKeyword = keyword.trim() || category || "best sellers";

  const cacheKey = `buyer:search:${searchIndex}:${effectiveKeyword}:${sortKey}:${page}`;
  try {
    const cached = await prisma.apiResponseCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      const raw = JSON.parse(cached.payload) as { items: unknown[] };
      const filtered = filterItems(raw.items, minPrice, maxPrice, minRating);
      return NextResponse.json({ ok: true, items: filtered, fromCache: true });
    }
  } catch { /* ignore cache errors */ }

  let result = await searchBuyerCatalog({
    keyword: effectiveKeyword,
    searchIndex,
    sortBy,
    maxResults: 10,
    itemPage: page,
  });

  if (!result.ok && result.error.includes("not configured")) {
    const spResult = await searchBuyerCatalogSpApi({ keyword: effectiveKeyword, maxResults: 10 });
    if (!spResult.ok) return NextResponse.json({ error: spResult.error }, { status: 502 });
    result = { ok: true, data: { items: spResult.data.items } };
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const items = result.data.items;

  try {
    await prisma.apiResponseCache.upsert({
      where: { cacheKey },
      update: { payload: JSON.stringify({ items }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
      create: { cacheKey, payload: JSON.stringify({ items }), expiresAt: new Date(Date.now() + CACHE_TTL_MS) },
    });
  } catch { /* ignore cache write errors */ }

  const filtered = filterItems(items, minPrice, maxPrice, minRating);
  return NextResponse.json({ ok: true, items: filtered });
}

function filterItems(
  items: unknown[],
  minPrice: number,
  maxPrice: number,
  minRating: number,
): unknown[] {
  return items.filter((item) => {
    const i = item as { price?: number | null; starRating?: number | null };
    if (minPrice > 0 && (i.price == null || i.price < minPrice)) return false;
    if (maxPrice > 0 && (i.price == null || i.price > maxPrice)) return false;
    if (minRating > 0 && (i.starRating == null || i.starRating < minRating)) return false;
    return true;
  });
}
