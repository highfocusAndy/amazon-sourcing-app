import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import type { ProductAnalysis } from "@/lib/types";
import type { CatalogItem } from "@/lib/spApiClient";

export const runtime = "nodejs";

function sameBrand(a: string, b: string): boolean {
  const x = (a || "").trim().toLowerCase();
  const y = (b || "").trim().toLowerCase();
  if (!x || !y) return false;
  return x === y;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { identifier?: string };

    if (!body.identifier || !body.identifier.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "identifier is required.",
          errorDetail: { code: "VALIDATION_ERROR", message: "identifier is required." },
        },
        { status: 400 },
      );
    }

    const identifier = body.identifier.trim();
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

    const first = await client.resolveCatalogItem(identifier);
    if (!first) {
      return NextResponse.json({
        ok: false,
        error: "Product not found for this ASIN/UPC/EAN.",
        results: [],
      });
    }

    const keyword = first.title.slice(0, 60).trim();
    if (!keyword) {
      const single: ProductAnalysis = buildCatalogOnlyResult(first, identifier);
      return NextResponse.json({ ok: true, results: [single] });
    }

    const items: CatalogItem[] = await client.searchCatalogByKeywordMultiple(keyword, 20);
    const seenAsin = new Set<string>();
    const sameBrandItems: CatalogItem[] = [];

    if (first.asin) {
      seenAsin.add(first.asin);
      sameBrandItems.push(first);
    }

    for (const item of items) {
      if (!item.asin || seenAsin.has(item.asin)) continue;
      if (!sameBrand(first.brand ?? "", item.brand ?? "")) continue;
      seenAsin.add(item.asin);
      sameBrandItems.push(item);
    }

    if (sameBrandItems.length === 0) {
      const single: ProductAnalysis = buildCatalogOnlyResult(first, identifier);
      return NextResponse.json({ ok: true, results: [single] });
    }

    const results: ProductAnalysis[] = sameBrandItems.map((catalog) =>
      buildCatalogOnlyResult(catalog, identifier),
    );

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error.",
        errorDetail: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unexpected server error.",
        },
      },
      { status: 500 },
    );
  }
}
