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
  strictPackageBrandFromVision,
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
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You analyze product photos for Amazon FBA catalog search. Images may show:
- Retail packaging (box, label, hang tag)
- A loose or unboxed product (phone case, cable, accessory on a desk, in hand)
- Close-ups with little or no branding

Return ONLY valid JSON (no markdown, no code fences, no commentary) with this exact shape:
{"query":"...","match_hints":["..."],"brand":"...","upc_ean":""}

Rules:
- "brand": The brand or trademark exactly as printed on the product or package. Use "" if there is no readable brand, if the item looks generic/unbranded, or only a store/private label with no name visible.
- "upc_ean": If a UPC, EAN, or GTIN barcode number is clearly visible, digits only (8–14), no spaces. Otherwise "".
- "query": English Amazon keyword search (max 22 words).
  - When a brand is visible: include brand + product line or model name + distinguishing details (size, scent, pack count, volume, color, etc.).
  - When NO brand is visible (common for phone cases, cables, generic accessories): build a **specific** search from what you see — product type (e.g. phone case, screen protector, USB cable), color/pattern, material (silicone, TPU, leather, clear), compatibility clues (e.g. iPhone 15 Pro Max, Samsung Galaxy, Pixel, USB-C, Lightning, MagSafe), and features (wallet, kickstand, card slot, glitter, shockproof). Combine enough terms to narrow results; avoid a single generic word like "case" alone.
  - Never return an empty "query" unless the image is unusable (not a product, totally blurry, or lens blocked).
- "match_hints": 5–12 short phrases (2–8 words) for ranking: colors, materials, model fit, pattern, bundle size, connector type, etc. When unbranded, use descriptive hints only — do not invent a brand.

Use {"query":"","match_hints":[],"brand":"","upc_ean":""} only when the photo shows no recognizable product or is unreadable.`,
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

    /** Only narrow the catalog pool when the model actually read a brand — avoids empty results for generic items. */
    const packageBrandStrict = strictPackageBrandFromVision(visionBrand);
    let pool = merged;
    if (packageBrandStrict) {
      let narrowed = merged.filter((it) => catalogItemMatchesPackageBrand(it, packageBrandStrict));
      if (narrowed.length === 0) {
        const retryItems = await client.searchCatalogByKeywordMultiple(packageBrandStrict, fetchCap);
        const seen = new Set(merged.map((x) => x.asin));
        const combined = [...merged];
        for (const it of retryItems) {
          if (!seen.has(it.asin)) {
            seen.add(it.asin);
            combined.push(it);
          }
        }
        narrowed = combined.filter((it) => catalogItemMatchesPackageBrand(it, packageBrandStrict));
      }
      if (narrowed.length > 0) {
        pool = narrowed;
      } else {
        // Avoid showing unrelated brands when the package brand is known but not in catalog hits.
        pool = [];
      }
    }

    let ranked = rankCatalogItemsByImageHints(pool, matchHints, derivedQuery, packageBrandStrict);

    if (packageBrandStrict && ranked.length > 0) {
      const seed = ranked[0]!;
      const expandKeyword = seed.title.slice(0, 72).trim();
      if (expandKeyword.length >= 10) {
        const expanded = await client.searchCatalogByKeywordMultiple(expandKeyword, IMAGE_SEARCH_EXPAND_MAX);
        const seen = new Set(ranked.map((x) => x.asin));
        const combined: CatalogItem[] = [...ranked];
        for (const it of expanded) {
          if (!it.asin || seen.has(it.asin)) continue;
          if (!catalogItemMatchesPackageBrand(it, packageBrandStrict)) continue;
          if (!catalogBrandCompatibleWithSeed(seed, it)) continue;
          seen.add(it.asin);
          combined.push(it);
        }
        ranked = rankCatalogItemsByImageHints(combined, matchHints, derivedQuery, packageBrandStrict);
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
