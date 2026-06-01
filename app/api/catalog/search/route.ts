/**
 * GET /api/catalog/search
 * Catalog browsing via PA-API when ff:pa_api_catalog is enabled, otherwise SP-API.
 */

import { NextRequest, NextResponse } from "next/server";
import { userCatalogSearchLimit } from "@/lib/apiRateLimit";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { isPaApiCatalogEnabled } from "@/lib/featureFlags";
import {
  getPaApiConfigurationIssue,
  isPaApiConfigured,
  fetchCatalogItemsFromPaApi,
  resolvePaApiSearchParams,
  searchCatalogByKeywordPaApi,
  enrichCatalogItemsWithMainBsr,
  type PaApiCatalogItem,
} from "@/lib/paApiClient";
import type { CatalogItem } from "@/lib/spApiClient";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

const CATALOG_UNAVAILABLE = "Catalog temporarily unavailable. Please try again shortly.";

/** True only if the query looks like a real ASIN (10 alphanumeric with both letter and digit). */
function isAsinQuery(q: string): boolean {
  if (!/^[A-Z0-9]{10}$/i.test(q)) return false;
  return /[A-Z]/i.test(q) && /\d/.test(q);
}

function maxCatalogPageSize(): number {
  const n = Number(process.env.CATALOG_SEARCH_MAX_PAGE_SIZE ?? 60);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.floor(n) : 60;
}

function paApiItemsToCatalogItems(items: PaApiCatalogItem[]): CatalogItem[] {
  return items.map((p) => ({
    asin: p.asin,
    title: p.title,
    brand: p.brand,
    rank: p.salesRank,
    imageUrl: p.imageUrl,
  }));
}

async function searchCatalogViaSpApi(
  userId: string,
  q: string,
  size: number,
  pageToken: string | null,
): Promise<
  | { ok: true; items: CatalogItem[]; nextPageToken: string | null }
  | { ok: false; error: string; status: number }
> {
  const client = await getSpApiClientForUserOrGlobal(userId);
  if (!client) {
    return {
      ok: false,
      error: SP_API_UNAVAILABLE_USER_MESSAGE,
      status: 503,
    };
  }

  if (isAsinQuery(q)) {
    const item = await client.fetchCatalogItem(q.toUpperCase());
    return { ok: true, items: item ? [item] : [], nextPageToken: null };
  }

  const { items, nextPageToken } = await client.searchCatalogByKeywordPage(q, pageToken, size);
  return { ok: true, items, nextPageToken };
}

async function searchCatalogViaPaApi(
  q: string,
  size: number,
  category: string | null,
  subcategory: string | null,
  keywordParam: string | null,
): Promise<
  | { ok: true; items: CatalogItem[]; nextPageToken: string | null }
  | { ok: false; error: string; status: number }
> {
  if (!isPaApiConfigured()) {
    const issue = getPaApiConfigurationIssue();
    return { ok: false, error: issue ?? CATALOG_UNAVAILABLE, status: 503 };
  }

  if (isAsinQuery(q)) {
    const result = await fetchCatalogItemsFromPaApi([q]);
    if (!result.ok) {
      return { ok: false, error: result.error || CATALOG_UNAVAILABLE, status: 503 };
    }
    return { ok: true, items: paApiItemsToCatalogItems(result.data), nextPageToken: null };
  }

  const { keywords, searchIndex } = resolvePaApiSearchParams({
    category,
    subcategory,
    keyword: keywordParam,
    fallbackQuery: q,
  });
  const result = await searchCatalogByKeywordPaApi(keywords, size, searchIndex);
  if (!result.ok) {
    return { ok: false, error: result.error || CATALOG_UNAVAILABLE, status: 503 };
  }
  return { ok: true, items: paApiItemsToCatalogItems(result.data.items), nextPageToken: null };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category")?.trim() || null;
  const subcategory = searchParams.get("subcategory")?.trim() || null;
  const keywordParam = searchParams.get("keyword")?.trim() || null;
  const legacyQ = searchParams.get("q")?.trim();

  const parts: string[] = [];
  if (category) parts.push(category);
  if (subcategory) parts.push(subcategory);
  if (keywordParam) parts.push(keywordParam);
  const q = parts.length > 0 ? parts.join(" ") : legacyQ?.trim();
  if (!q) {
    return NextResponse.json({ items: [], nextPageToken: null });
  }

  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  if (!(await userCatalogSearchLimit(gate.userId))) {
    return NextResponse.json(
      { error: "Too many catalog searches. Wait a minute and try again.", items: [], nextPageToken: null },
      { status: 429 },
    );
  }
  const usage = await consumeMonthlyUsage(gate.userId, "catalog_search");
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: "Monthly catalog-search limit reached for your plan.",
        code: "USAGE_LIMIT",
        metric: usage.metric,
        period: usage.periodKey,
        used: usage.used,
        limit: usage.limit,
        items: [],
        nextPageToken: null,
      },
      { status: 429 },
    );
  }

  const rawPageSize = searchParams.get("pageSize");
  const requested = rawPageSize ? Math.min(500, Math.max(1, parseInt(rawPageSize, 10))) : 30;
  const size = Number.isFinite(requested) ? Math.min(requested, maxCatalogPageSize()) : Math.min(30, maxCatalogPageSize());

  const pageToken = searchParams.get("pageToken")?.trim() || null;

  try {
    const usePaApi = await isPaApiCatalogEnabled();
    const result = usePaApi
      ? await searchCatalogViaPaApi(q, size, category, subcategory, keywordParam)
      : await searchCatalogViaSpApi(gate.userId, q, size, pageToken);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, items: [], nextPageToken: null },
        { status: result.status },
      );
    }

    const items = await enrichCatalogItemsWithMainBsr(result.items);
    return NextResponse.json({ items, nextPageToken: result.nextPageToken ?? null });
  } catch (e) {
    console.error("Catalog search error:", e);
    return NextResponse.json(
      { error: CATALOG_UNAVAILABLE, items: [], nextPageToken: null },
      { status: 503 },
    );
  }
}
