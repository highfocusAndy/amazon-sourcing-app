import { NextRequest, NextResponse } from "next/server";

import { userKeywordSearchLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import {
  getKeywordSearchCache,
  setKeywordSearchCache,
} from "@/lib/spApiResponseCache";
import type { ProductAnalysis } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const pageSize = Math.min(30, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));

  try {
    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userKeywordSearchLimit(gate.userId)) {
      return NextResponse.json(
        { ok: false, error: "Too many keyword searches. Wait a minute.", results: [] },
        { status: 429 },
      );
    }
    const client = await getSpApiClientForUserOrGlobal(gate.userId);
    if (!client) {
      return NextResponse.json(
        {
          ok: false,
          error: SP_API_UNAVAILABLE_USER_MESSAGE,
          results: [],
        },
        { status: 503 },
      );
    }
    const marketplaceId = client.marketplaceId;
    const cached = await getKeywordSearchCache(marketplaceId, q, pageSize);
    if (cached && cached.length > 0) {
      return NextResponse.json({ ok: true, results: cached });
    }
    const items = await client.searchCatalogByKeywordMultiple(q, pageSize);
    const results: ProductAnalysis[] = items.map((catalog) =>
      buildCatalogOnlyResult(catalog, q),
    );
    if (results.length > 0) {
      void setKeywordSearchCache(marketplaceId, q, pageSize, results);
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Keyword search failed.",
        results: [],
      },
      { status: 500 },
    );
  }
}
