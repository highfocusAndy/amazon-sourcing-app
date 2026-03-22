import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { buildCatalogOnlyResult } from "@/lib/analysis";
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
    const session = await auth();
    const client = await getSpApiClientForUserOrGlobal(session?.user?.id);
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
    const items = await client.searchCatalogByKeywordMultiple(q, pageSize);
    const results: ProductAnalysis[] = items.map((catalog) =>
      buildCatalogOnlyResult(catalog, q),
    );
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
