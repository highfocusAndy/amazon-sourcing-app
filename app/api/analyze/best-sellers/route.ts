/**
 * GET /api/analyze/best-sellers
 * Returns up to 20 top-selling Amazon products for the explorer's initial state.
 * Uses PA-API with sortBy "Featured" when available; falls back to SP-API keyword search.
 * Results are cached for 6 hours — no monthly usage quota is consumed.
 */

import { NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { isPaApiCatalogEnabled } from "@/lib/featureFlags";
import {
  isPaApiConfigured,
  searchCatalogByKeywordPaApi,
} from "@/lib/paApiClient";
import { buildProductAnalysisFromPaApi, buildCatalogOnlyResult } from "@/lib/analysis";
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
// PA-API only returns max 10 per request; make two calls for different categories to hit 20.
const PA_API_BATCH = 10;

// Module-level inflight lock — concurrent cold-cache requests share one SP-API / PA-API call
// instead of each making their own. Cleared once the fetch settles.
let inflightFetch: Promise<ProductAnalysis[] | null> | null = null;

async function fetchViaPaApi(): Promise<ProductAnalysis[] | null> {
  const [general, home] = await Promise.all([
    searchCatalogByKeywordPaApi("best sellers", PA_API_BATCH, "All", "Featured"),
    searchCatalogByKeywordPaApi("best sellers", PA_API_BATCH, "HomeGarden", "Featured"),
  ]);

  const seenAsins = new Set<string>();
  const combined: ProductAnalysis[] = [];

  for (const result of [general, home]) {
    if (!result.ok) continue;
    for (const item of result.data.items) {
      if (seenAsins.has(item.asin)) continue;
      seenAsins.add(item.asin);
      combined.push(
        buildProductAnalysisFromPaApi(item, { identifier: item.asin, wholesalePrice: 0 }),
      );
      if (combined.length >= PAGE_SIZE) break;
    }
    if (combined.length >= PAGE_SIZE) break;
  }

  return combined.length > 0 ? combined : null;
}

export async function GET(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const usePaApi = await isPaApiCatalogEnabled();
  const hasPaApi = usePaApi && isPaApiConfigured();
  const hasAmazon = await hasConnectedAmazonAccount(gate.userId);

  if (!hasPaApi && !hasAmazon) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Use a fixed cache key so all users share the same best-sellers snapshot.
  const cacheMarketplace = process.env.MARKETPLACE_ID ?? "ATVPDKIKX0DER";
  const cached = await getKeywordSearchCache(cacheMarketplace, BEST_SELLERS_QUERY, PAGE_SIZE);
  if (cached && cached.length > 0) {
    return NextResponse.json({ ok: true, results: cached });
  }

  if (!inflightFetch) {
    inflightFetch = (async () => {
      try {
        let results: ProductAnalysis[] | null = null;

        if (hasPaApi) {
          results = await fetchViaPaApi();
        }

        if (!results && hasAmazon) {
          const client = await getSpApiClientForUser(gate.userId);
          if (client) {
            const items = await client.searchCatalogByKeywordMultiple("best sellers", PAGE_SIZE);
            const mapped = items.map((c) => buildCatalogOnlyResult(c, "best sellers"));
            if (mapped.length > 0) results = mapped;
          }
        }

        if (results && results.length > 0) {
          void setKeywordSearchCache(cacheMarketplace, BEST_SELLERS_QUERY, PAGE_SIZE, results);
        }

        return results;
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
