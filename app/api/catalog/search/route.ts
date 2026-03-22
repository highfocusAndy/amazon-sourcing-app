import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";

/** True only if the query looks like a real ASIN (10 alphanumeric with both letter and digit). */
function isAsinQuery(q: string): boolean {
  if (!/^[A-Z0-9]{10}$/i.test(q)) return false;
  return /[A-Z]/i.test(q) && /\d/.test(q);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ items: [], nextPageToken: null });
  }

  const pageTokenParam = searchParams.get("pageToken")?.trim() || null;
  const rawPageSize = searchParams.get("pageSize");
  const pageSize = rawPageSize
    ? Math.min(500, Math.max(1, parseInt(rawPageSize, 10)))
    : 30;
  const size = Number.isFinite(pageSize) ? pageSize : 30;

  try {
    const session = await auth();
    const client = await getSpApiClientForUserOrGlobal(session?.user?.id);
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
    if (isAsinQuery(q)) {
      const item = await client.fetchCatalogItem(q);
      return NextResponse.json({
        items: item ? [item] : [],
        nextPageToken: null,
      });
    }
    const { items, nextPageToken } = await client.searchCatalogByKeywordPage(
      q,
      pageTokenParam,
      size,
    );
    return NextResponse.json({ items, nextPageToken });
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
