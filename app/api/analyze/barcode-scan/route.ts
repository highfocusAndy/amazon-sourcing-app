import { NextRequest, NextResponse } from "next/server";

import { userAnalyzeLimit } from "@/lib/apiRateLimit";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import type { ProductAnalysis } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { identifier?: string };
    const identifier = body.identifier?.trim() ?? "";
    if (!identifier) {
      return NextResponse.json({ ok: false, error: "identifier is required.", results: [] }, { status: 400 });
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!(await userAnalyzeLimit(gate.userId))) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many requests. Wait a minute.",
          errorDetail: { code: "RATE_LIMIT", message: "Too many requests. Wait a minute." },
          results: [],
        },
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

    const catalogItems = await client.resolveAllCatalogItems(identifier);
    if (catalogItems.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Product not found for this barcode.",
        results: [],
      });
    }

    const results: ProductAnalysis[] = catalogItems.map((item) =>
      buildCatalogOnlyResult(item, identifier, { group: "exact", reason: "Exact barcode match" }),
    );
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error.",
        results: [],
      },
      { status: 500 },
    );
  }
}
