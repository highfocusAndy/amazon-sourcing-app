/**
 * GET /api/analyze/best-sellers
 * Returns up to 20 top-selling Amazon products for the explorer's initial state.
 * Uses SP-API only — PA-API is reserved for buyer mode.
 * Results are cached for 6 hours — no monthly usage quota is consumed.
 */

import { NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import {
  getKeywordSearchCache,
  setKeywordSearchCache,
} from "@/lib/spApiResponseCache";
import {
  getSpApiClientForUser,
  hasConnectedAmazonAccount,
} from "@/lib/amazonAccount";
import type { ProductAnalysis } from "@/lib/types";

export const runtime = "nodejs";

const BEST_SELLERS_QUERY = "__best_sellers__";
const PAGE_SIZE = 20;

// Module-level inflight lock — concurrent cold-cache requests share one SP-API call
// instead of each making their own. Cleared once the fetch settles.
let inflightFetch: Promise<ProductAnalysis[] | null> | null = null;

export async function GET(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
  if (!hasAmazon) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const cacheMarketplace = process.env.MARKETPLACE_ID ?? "ATVPDKIKX0DER";
  const cached = await getKeywordSearchCache(cacheMarketplace, BEST_SELLERS_QUERY, PAGE_SIZE);
  if (cached && cached.length > 0) {
    return NextResponse.json({ ok: true, results: cached });
  }

  if (!inflightFetch) {
    inflightFetch = (async () => {
      try {
        const client = await getSpApiClientForUser(gate.userId);
        if (!client) return null;

        const items = await client.searchCatalogByKeywordMultiple("best sellers", PAGE_SIZE);
        const results = items.map((c) => buildCatalogOnlyResult(c, "best sellers"));
        if (results.length > 0) {
          void setKeywordSearchCache(cacheMarketplace, BEST_SELLERS_QUERY, PAGE_SIZE, results);
        }
        return results.length > 0 ? results : null;
      } finally {
        inflightFetch = null;
      }
    })();
  }

  const results = await inflightFetch;

  if (!results || results.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  return NextResponse.json({ ok: true, results });
}
