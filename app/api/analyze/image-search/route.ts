import { NextRequest, NextResponse } from "next/server";

import { userKeywordSearchLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import type { CatalogItem } from "@/lib/spApiClient";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import {
  catalogBrandCompatibleWithSeed,
  catalogItemMatchesPackageBrand,
  parseVisionProductJson,
  rankCatalogItemsByImageHints,
  resolveBrandForImageSearch,
} from "@/lib/imageSearchRanking";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** After brand match, expand by catalog title (same pattern as variations API) to include pack/size ASINs. */
const IMAGE_SEARCH_EXPAND_MAX = 100;

function firstLine(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Photo-based product search is not enabled on this server. Set OPENAI_API_KEY, or use a barcode/keyword.",
          code: "VISION_UNAVAILABLE",
          results: [] as ProductAnalysis[],
        },
        { status: 503 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userKeywordSearchLimit(gate.userId)) {
      return NextResponse.json(
        { ok: false, error: "Too many searches. Wait a minute.", results: [] },
        { status: 429 },
      );
    }

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing image file.", results: [] }, { status: 400 });
    }

    const mime = image.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image.", results: [] },
        { status: 400 },
      );
    }

    if (image.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image too large (max 4 MB).", results: [] },
        { status: 413 },
      );
    }

    const usage = await consumeMonthlyUsage(gate.userId, "keyword_search");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly keyword-search limit reached for your plan.",
          errorDetail: {
            code: "USAGE_LIMIT",
            metric: usage.metric,
            period: usage.periodKey,
            used: usage.used,
            limit: usage.limit,
          },
          results: [],
        },
        { status: 429 },
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const visionModel = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
    const visionDetail = process.env.OPENAI_VISION_DETAIL?.trim().toLowerCase() === "low" ? "low" : "high";

    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        max_tokens: 450,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You analyze retail product packaging for Amazon FBA catalog search.

Return ONLY valid JSON (no markdown, no code fences, no commentary) with this exact shape:
{"query":"...","match_hints":["..."],"brand":"...","upc_ean":""}

Rules:
- "brand": The brand name exactly as printed on the package (required if readable). Empty string only if unreadable.
- "upc_ean": If a UPC, EAN, or GTIN barcode NUMBER is clearly visible on the label, the digits only (8–14 digits), no spaces. Otherwise "".
- "query": English Amazon keyword search (max 22 words). MUST include the brand and the specific product line / variant name — never a category-only query like "beard oil" or "shampoo" alone when the brand is visible. Add pack count, bundle vs single, volume (oz/ml), scent/flavor, color, organic, etc. Prefer exact package wording.
- "match_hints": 5–12 short phrases (2–7 words) that distinguish THIS listing from same-category items: product line name, size, scent, count, "for men", etc. Include the brand in at least one hint when possible. Avoid hints that are only the generic category.

If the image is not a recognizable retail product, reply exactly: {"query":"","match_hints":[],"brand":"","upc_ean":""}`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: visionDetail },
              },
            ],
          },
        ],
      }),
    });

    if (!oaiRes.ok) {
      const detail = await oaiRes.text();
      return NextResponse.json(
        {
          ok: false,
          error: `Image understanding request failed (${oaiRes.status}).`,
          detail: detail.slice(0, 500),
          results: [],
        },
        { status: 502 },
      );
    }

    const completion = (await oaiRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const rawContent = completion.choices?.[0]?.message?.content?.trim() ?? "";

    const parsed = parseVisionProductJson(rawContent);
    let derivedQuery: string;
    let matchHints: string[];

    let visionBrand: string | undefined;
    let upcDigits: string | undefined;

    if (parsed) {
      derivedQuery = parsed.query;
      matchHints = parsed.match_hints;
      visionBrand = parsed.brand;
      upcDigits = parsed.upc_ean;
    } else {
      const line = firstLine(rawContent).replace(/^["']|["']$/g, "").trim();
      if (!line || /^UNKNOWN$/i.test(line)) {
        return NextResponse.json({
          ok: true,
          results: [] as ProductAnalysis[],
          derivedQuery: null,
        });
      }
      derivedQuery = line;
      matchHints = [];
    }

    if (!derivedQuery) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
      });
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

    const pageSize = Math.min(30, Math.max(1, parseInt(form.get("pageSize")?.toString() ?? "20", 10) || 20));
    /** Fetch extra catalog rows so we can re-rank toward brand + pack matches, then trim. */
    const fetchCap = Math.min(60, Math.max(pageSize * 2, 36));

    let fromIdentifier: CatalogItem | null = null;
    if (upcDigits) {
      fromIdentifier = await client.resolveCatalogItem(upcDigits).catch(() => null);
    }

    const rawItems = await client.searchCatalogByKeywordMultiple(derivedQuery, fetchCap);
    const seenAsin = new Set<string>();
    const merged: typeof rawItems = [];
    if (fromIdentifier) {
      merged.push(fromIdentifier);
      seenAsin.add(fromIdentifier.asin);
    }
    for (const it of rawItems) {
      if (!seenAsin.has(it.asin)) {
        seenAsin.add(it.asin);
        merged.push(it);
      }
    }

    const effectiveBrand = resolveBrandForImageSearch(visionBrand, derivedQuery);
    let pool = merged;
    if (effectiveBrand) {
      let narrowed = merged.filter((it) => catalogItemMatchesPackageBrand(it, effectiveBrand));
      if (narrowed.length === 0) {
        const retryItems = await client.searchCatalogByKeywordMultiple(effectiveBrand, fetchCap);
        const seen = new Set(merged.map((x) => x.asin));
        const combined = [...merged];
        for (const it of retryItems) {
          if (!seen.has(it.asin)) {
            seen.add(it.asin);
            combined.push(it);
          }
        }
        narrowed = combined.filter((it) => catalogItemMatchesPackageBrand(it, effectiveBrand));
      }
      if (narrowed.length > 0) {
        pool = narrowed;
      } else {
        // Avoid showing unrelated brands when the package brand is known but not in catalog hits.
        pool = [];
      }
    }

    let ranked = rankCatalogItemsByImageHints(pool, matchHints, derivedQuery, effectiveBrand ?? visionBrand ?? null);

    if (effectiveBrand && ranked.length > 0) {
      const seed = ranked[0]!;
      const expandKeyword = seed.title.slice(0, 72).trim();
      if (expandKeyword.length >= 10) {
        const expanded = await client.searchCatalogByKeywordMultiple(expandKeyword, IMAGE_SEARCH_EXPAND_MAX);
        const seen = new Set(ranked.map((x) => x.asin));
        const combined: CatalogItem[] = [...ranked];
        for (const it of expanded) {
          if (!it.asin || seen.has(it.asin)) continue;
          if (!catalogItemMatchesPackageBrand(it, effectiveBrand)) continue;
          if (!catalogBrandCompatibleWithSeed(seed, it)) continue;
          seen.add(it.asin);
          combined.push(it);
        }
        ranked = rankCatalogItemsByImageHints(combined, matchHints, derivedQuery, effectiveBrand);
      }
    }

    const maxRows = Math.min(IMAGE_SEARCH_EXPAND_MAX, Math.max(pageSize, ranked.length));
    const items = ranked.slice(0, maxRows);
    const results: ProductAnalysis[] = items.map((catalog) => buildCatalogOnlyResult(catalog, derivedQuery));

    return NextResponse.json({
      ok: true,
      results,
      derivedQuery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Image search failed.",
        results: [],
      },
      { status: 500 },
    );
  }
}
