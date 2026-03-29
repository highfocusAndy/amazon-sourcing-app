import { NextRequest, NextResponse } from "next/server";
import { userCatalogSearchLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { getCatalogSearchPageCache, setCatalogSearchPageCache } from "@/lib/spApiResponseCache";

/** True only if the query looks like a real ASIN (10 alphanumeric with both letter and digit). */
function isAsinQuery(q: string): boolean {
  if (!/^[A-Z0-9]{10}$/i.test(q)) return false;
  return /[A-Z]/i.test(q) && /\d/.test(q);
}

function maxCatalogPageSize(): number {
  const n = Number(process.env.CATALOG_SEARCH_MAX_PAGE_SIZE ?? 60);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.floor(n) : 60;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ items: [], nextPageToken: null });
  }

  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  if (!userCatalogSearchLimit(gate.userId)) {
    return NextResponse.json(
      { error: "Too many catalog searches. Wait a minute and try again.", items: [], nextPageToken: null },
      { status: 429 },
    );
  }

  const pageTokenParam = searchParams.get("pageToken")?.trim() || null;
  const rawPageSize = searchParams.get("pageSize");
  const requested = rawPageSize ? Math.min(500, Math.max(1, parseInt(rawPageSize, 10))) : 30;
  const size = Number.isFinite(requested) ? Math.min(requested, maxCatalogPageSize()) : Math.min(30, maxCatalogPageSize());

  try {
    const client = await getSpApiClientForUserOrGlobal(gate.userId);
    if (!client) {
      return NextResponse.json(
        {
          error: SP_API_UNAVAILABLE_USER_MESSAGE,
          items: [],
          nextPageToken: null,
        },
        { status: 503 },
      );
    }

    const marketplaceId = client.marketplaceId;
    const cached = await getCatalogSearchPageCache(marketplaceId, q, pageTokenParam, size);
    if (cached) {
      return NextResponse.json({
        items: cached.items,
        nextPageToken: cached.nextPageToken,
      });
    }

    if (isAsinQuery(q)) {
      const item = await client.fetchCatalogItem(q);
      const payload = {
        items: item ? [item] : [],
        nextPageToken: null as string | null,
      };
      await setCatalogSearchPageCache(marketplaceId, q, pageTokenParam, size, payload);
      return NextResponse.json(payload);
    }

    const { items, nextPageToken } = await client.searchCatalogByKeywordPage(q, pageTokenParam, size);
    const payload = { items, nextPageToken };
    await setCatalogSearchPageCache(marketplaceId, q, pageTokenParam, size, payload);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Catalog search failed.";
    console.error("Catalog search error:", e);
    const isConfigError =
      /missing|required|\.env|not configured|credentials/i.test(message);
    const isRateLimit =
      /rate limit|QuotaExceeded|throttl/i.test(message);
    const status = isConfigError || isRateLimit ? 503 : 500;
    const userMessage = isConfigError
      ? SP_API_UNAVAILABLE_USER_MESSAGE
      : message;
    return NextResponse.json(
      { error: userMessage, items: [], nextPageToken: null },
      { status }
    );
  }
}
