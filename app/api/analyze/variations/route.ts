import { NextRequest, NextResponse } from "next/server";

import { userAnalyzeLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import {
  catalogBrandsCompatibleForFamily,
  catalogItemSameProductFamilyLine,
  detectMultipackInTitle,
} from "@/lib/imageSearchRanking";
import type { ProductAnalysis } from "@/lib/types";
import type { CatalogItem } from "@/lib/spApiClient";

export const runtime = "nodejs";

const VARIATION_SEARCH_CAP = 100;

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
    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userAnalyzeLimit(gate.userId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many requests. Wait a minute.",
          errorDetail: { code: "RATE_LIMIT", message: "Too many requests. Wait a minute." },
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

    const first = await client.resolveCatalogItem(identifier);
    if (!first) {
      return NextResponse.json({
        ok: false,
        error: "Product not found for this ASIN/UPC/EAN.",
        results: [],
      });
    }

    const amazonFamily = first.asin
      ? await client.resolveVariationFamilyItems(first.asin, VARIATION_SEARCH_CAP).catch(() => null)
      : null;

    let rows: CatalogItem[] = [];
    let usedAmazonFamily = false;
    if (amazonFamily && amazonFamily.items.length > 0) {
      rows = amazonFamily.items;
      usedAmazonFamily = amazonFamily.resolved;
    } else {
      const keyword = first.title.slice(0, 60).trim();
      if (!keyword) {
        const single: ProductAnalysis = buildCatalogOnlyResult(first, identifier, {
          group: "exact",
          reason: "Exact scanned product",
        });
        return NextResponse.json({ ok: true, results: [single] });
      }
      const items: CatalogItem[] = await client.searchCatalogByKeywordMultiple(keyword, VARIATION_SEARCH_CAP);
      const seenAsin = new Set<string>();
      const brandFiltered: CatalogItem[] = [];
      if (first.asin) {
        seenAsin.add(first.asin);
        brandFiltered.push(first);
      }
      for (const item of items) {
        if (!item.asin || seenAsin.has(item.asin)) continue;
        if (!catalogBrandsCompatibleForFamily(first.brand ?? "", item.brand ?? "")) continue;
        seenAsin.add(item.asin);
        brandFiltered.push(item);
      }
      rows = !first.asin
        ? brandFiltered.slice(0, 1)
        : brandFiltered.filter((item) => item.asin === first.asin || catalogItemSameProductFamilyLine(first, item));
    }

    if (rows.length === 0) {
      const single: ProductAnalysis = buildCatalogOnlyResult(first, identifier, {
        group: "exact",
        reason: "Exact scanned product",
      });
      return NextResponse.json({ ok: true, results: [single] });
    }

    const ordered = rows.sort((a, b) => {
      if (a.asin === first.asin) return -1;
      if (b.asin === first.asin) return 1;
      const aMulti = detectMultipackInTitle(a.title) ? 1 : 0;
      const bMulti = detectMultipackInTitle(b.title) ? 1 : 0;
      return aMulti - bMulti;
    });

    const results: ProductAnalysis[] = ordered.map((catalog) => {
      if (catalog.asin === first.asin) {
        return buildCatalogOnlyResult(catalog, identifier, {
          group: "exact",
          reason: "Exact scanned product",
        });
      }
      if (usedAmazonFamily) {
        return buildCatalogOnlyResult(catalog, identifier, {
          group: detectMultipackInTitle(catalog.title) ? "multipack" : "variation",
          reason: detectMultipackInTitle(catalog.title)
            ? "Confirmed variation family - multipack"
            : "Confirmed variation family",
        });
      }
      return buildCatalogOnlyResult(catalog, identifier, {
        group: "possible_related",
        reason: "Possible related listing (variation graph unavailable)",
      });
    });

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
