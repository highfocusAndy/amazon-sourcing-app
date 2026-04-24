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
  buildStableAmazonIdentityQuery,
  buildVisionParseFromCatalogSeed,
  catalogBrandsCompatibleForFamily,
  catalogItemSameProductFamilyLine,
  catalogTitleMatchesAuxProductType,
  catalogTitleMatchesProductFamily,
  classifyFamilyMatch,
  detectCatalogCanonicalProductType,
  detectMultipackInTitle,
  familyTokens,
  parseVisionProductFamilyJson,
  sortByFamilyMatchGroup,
  strictPackageBrandFromVision,
  type VisionProductFamilyParse,
} from "@/lib/imageSearchRanking";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Cap on rows we'll fetch from SP-API and consider for family matching. */
const FAMILY_SEARCH_FETCH_CAP = 100;
/** Product type must be explicitly identified with high confidence before family search. */
const MIN_PRODUCT_TYPE_CONFIDENCE = 0.72;
/** Extremely low vision confidence means the image is unusable. */
const MIN_USABLE_IMAGE_CONFIDENCE = 0.12;
const LOW_PRODUCT_TYPE_CONFIDENCE = 0.5;

const NOTICE_UNCLEAR =
  "Unable to confidently identify the product. Please rescan.";
const NOTICE_NOT_ON_AMAZON =
  "This product does not appear to be listed on Amazon yet.";

const VISION_PROMPT = `You analyze one retail product photo. Your job is to extract a STABLE PRODUCT IDENTITY for Amazon catalog lookup — not loose keywords, not brand-only guesses.

Return ONLY valid JSON (no markdown, no code fences, no commentary) with this exact shape:

{
  "barcode_detected": false,
  "barcode_value": "",
  "brand": "",
  "package_form": "",
  "product_type": "",
  "product_type_confidence": 0,
  "core_product_family": "",
  "product_name": "",
  "variant": "",
  "size": "",
  "count": "",
  "flavor_scent_color": "",
  "model_number": "",
  "visible_text": [],
  "confidence": 0
}

Rules — strict; do not invent; same photo must always yield the same JSON:

- "barcode_detected" / "barcode_value": true ONLY when a UPC/EAN/GTIN is clearly readable. Digits only, 8–14 chars. Otherwise false and "".

- "brand": Manufacturer name as printed (logo area, ®/™). NOT the biggest front word, NOT scent/material/generic nouns (shampoo, lotion, olive, lavender, silicone, case, …). If unsure, "".

- "package_form": One of: "pump bottle", "tube", "tall bottle", "oil bottle", "jar", or "" if unclear.

- "product_type" (REQUIRED for confident output): choose ONLY one canonical value:
  - "lotion"
  - "shampoo"
  - "conditioner"
  - "oil"
  - "cream"
  - "cleanser"
  Use packaging shape + label structure first (not vague words like "olive", "care", "treatment").

- "product_type_confidence": 0..1 confidence for product_type only. Keep low when uncertain, blurred, or conflicting cues.

- "core_product_family" (required for a confident match): The specific product LINE name as printed, brand stripped — the words that distinguish this line from OTHER lines the same brand sells. Never only the brand. Never vague buckets like "olive hair care". Examples: "Daily Moisture Body Lotion", "Clinical Strength Antiperspirant", "Vitamin C 1000mg Tablets".

- "product_name": Full front-of-pack marketing name if readable.

- "variant", "size", "count", "flavor_scent_color", "model_number": Only when printed.

- "visible_text": Up to 10 short phrases EXACTLY as printed on the package (for audit only — NOT a keyword list for search). No invented phrases.

- "confidence": 0..1 overall product identity confidence. Use ≤ 0.15 when blurry/dark/partial/not a product. Use ≤ 0.35 when you cannot read both a credible brand OR a specific product line. Never output high confidence from guessing.

If unusable, return empty strings, false barcode, "confidence": 0.`;

/**
 * Common scent / material / color / generic words that vision models sometimes pick up as the "brand"
 * when a package puts that word in big front-of-box letters. We use this to scrub a clearly-wrong brand
 * before running the catalog search.
 */
const VARIANT_LIKE_BRAND_WORDS = new Set([
  "olive",
  "lavender",
  "mint",
  "vanilla",
  "rose",
  "jasmine",
  "cocoa",
  "chocolate",
  "almond",
  "citrus",
  "lemon",
  "mango",
  "ocean",
  "fresh",
  "natural",
  "pure",
  "original",
  "classic",
  "silicone",
  "leather",
  "cotton",
  "wood",
  "glass",
  "shampoo",
  "soap",
  "lotion",
  "oil",
  "cream",
  "gel",
  "wipes",
  "case",
  "cable",
  "spray",
]);

function brandLooksLikeVariantWord(brand: string): boolean {
  const cleaned = brand.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!cleaned) return false;
  const words = cleaned.split(/\s+/);
  if (words.length === 1) return VARIANT_LIKE_BRAND_WORDS.has(words[0]!);
  return false; // multi-word brands are usually real (e.g. "Tropic Isle Living")
}

/**
 * Strict brand match: when vision read a brand from the package, require the catalog row's
 * `brand` field (NOT the title) to actually match. This is what stops "olive" appearing in a
 * title from passing as if it were the brand.
 *
 * - Empty package brand → always pass (unbranded items, generic accessories).
 * - Package brand vs catalog brand: case-insensitive exact OR one contains the other (handles
 *   "ibi" vs "IBI", "Tropic Isle" vs "Tropic Isle Living").
 */
function strictCatalogBrandMatch(catalogBrand: string, packageBrand: string | null): boolean {
  if (!packageBrand) return true;
  const pb = packageBrand.trim().toLowerCase();
  if (pb.length < 2) return true;
  const cb = catalogBrand.trim().toLowerCase();
  if (!cb) return false;
  if (cb === pb) return true;
  if (cb.includes(pb) || pb.includes(cb)) return true;
  return false;
}

type ScanLogEntry = {
  asin: string;
  title: string;
  status: "accepted" | "rejected";
  reason: string;
};

type ProductTypeMode = "high" | "medium" | "low" | "unknown";

function logScanResults(label: string, entries: ScanLogEntry[]): void {
  if (entries.length === 0) return;
  const accepted = entries.filter((e) => e.status === "accepted");
  const rejected = entries.filter((e) => e.status === "rejected");
  console.log(
    `[image-search] ${label} → ${accepted.length} accepted, ${rejected.length} rejected`,
  );
  for (const e of entries.slice(0, 30)) {
    console.log(
      `[image-search]   ${e.status === "accepted" ? "✓" : "✗"} ${e.asin} :: ${e.reason} :: ${e.title.slice(0, 90)}`,
    );
  }
}

function normalizeFormBarcode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").trim();
}

function titleMatchesVisibleText(title: string, visibleText: string[]): boolean {
  if (visibleText.length === 0) return false;
  const t = title.toLowerCase();
  const cues = visibleText
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length >= 4)
    .slice(0, 10);
  if (cues.length === 0) return false;
  let hits = 0;
  for (const cue of cues) {
    if (t.includes(cue)) hits++;
  }
  return hits >= 1;
}

function inferTypeMode(parse: VisionProductFamilyParse): ProductTypeMode {
  if (!parse.product_type.trim()) return "unknown";
  if (parse.product_type_confidence >= MIN_PRODUCT_TYPE_CONFIDENCE) return "high";
  if (parse.product_type_confidence >= LOW_PRODUCT_TYPE_CONFIDENCE) return "medium";
  return "low";
}

function imageIdentityIsUsable(parse: VisionProductFamilyParse): boolean {
  if (parse.confidence >= MIN_USABLE_IMAGE_CONFIDENCE) return true;
  const hasIdentitySignal = Boolean(
    parse.brand.trim() ||
      parse.product_name.trim() ||
      parse.core_product_family.trim() ||
      parse.visible_text.length > 0,
  );
  return hasIdentitySignal;
}

const PRODUCT_TYPE_TOKENS = ["lotion", "shampoo", "conditioner", "oil", "cream", "cleanser"] as const;

function isLikelyCrossProductBundleTitle(title: string, parse: VisionProductFamilyParse): boolean {
  const t = title.toLowerCase();
  const hasBundleCue =
    /\b(bundle|combo|kit|set|value\s*pack|gift\s*set|with)\b/.test(t) || /\s&\s/.test(t);
  if (!hasBundleCue) return false;
  const expected = parse.product_type.trim().toLowerCase();
  const typesInTitle = PRODUCT_TYPE_TOKENS.filter((tok) => t.includes(tok));
  if (typesInTitle.length >= 2) return true;
  if (expected && typesInTitle.length >= 1 && !typesInTitle.includes(expected as (typeof PRODUCT_TYPE_TOKENS)[number])) {
    return true;
  }
  const family = parse.core_product_family.trim().toLowerCase();
  if (family && !t.includes(family) && /\bwith\b/.test(t)) return true;
  return false;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userKeywordSearchLimit(gate.userId)) {
      return NextResponse.json(
        { ok: false, error: "Too many searches. Wait a minute.", results: [] },
        { status: 429 },
      );
    }

    const form = await request.formData();
    const formBarcodeDigits = normalizeFormBarcode(form.get("barcode"));
    const formBarcodeOk = formBarcodeDigits.length >= 8 && formBarcodeDigits.length <= 14;

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

    // -----------------------------------------------------------------
    // Client / hardware barcode first (before vision — no LLM cost).
    // -----------------------------------------------------------------
    if (formBarcodeOk) {
      const seedFromForm = await client.resolveCatalogItem(formBarcodeDigits).catch(() => null);
      if (seedFromForm) {
        const usageEarly = await consumeMonthlyUsage(gate.userId, "keyword_search");
        if (!usageEarly.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: "Monthly keyword-search limit reached for your plan.",
              errorDetail: {
                code: "USAGE_LIMIT",
                metric: usageEarly.metric,
                period: usageEarly.periodKey,
                used: usageEarly.used,
                limit: usageEarly.limit,
              },
              results: [],
            },
            { status: 429 },
          );
        }
        const parseFromBarcode = buildVisionParseFromCatalogSeed(seedFromForm);
        console.log(
          `[image-search] form barcode ${formBarcodeDigits} resolved → ${seedFromForm.asin} :: ${seedFromForm.title.slice(0, 90)}`,
        );
        const grouped = await collectFamilyResults({
          client,
          parse: parseFromBarcode,
          seed: seedFromForm,
          seedReason: "exact barcode match",
        });
        return NextResponse.json({
          ok: true,
          results: grouped.results.slice(0, Math.max(pageSize, grouped.results.length)),
          derivedQuery: formBarcodeDigits,
          matchPath: "barcode",
          visionParse: null,
        });
      }
      console.log(`[image-search] form barcode ${formBarcodeDigits} → not in catalog; continuing with vision`);
    }

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
        max_tokens: 700,
        /** Deterministic so the same photo gives the same JSON every time the user re-scans. */
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: visionDetail } },
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
    const parseRaw = parseVisionProductFamilyJson(rawContent);

    /**
     * Scrub a clearly-wrong "brand": when a single word like "olive" or "shampoo" is returned,
     * vision almost certainly picked the largest word on the package (which is the variant, not
     * the brand). Drop it to "" so the search doesn't get poisoned by every olive-themed product.
     */
    let parse = parseRaw;
    if (parse && parse.brand && brandLooksLikeVariantWord(parse.brand)) {
      const scrubbedBrand = parse.brand;
      console.log(`[image-search] dropping suspect brand "${scrubbedBrand}" (looks like variant word)`);
      parse = {
        ...parse,
        brand: "",
        variant: parse.variant ? parse.variant : scrubbedBrand,
      };
    }

    const derivedQuery = parse ? buildStableAmazonIdentityQuery(parse) : "";
    console.log(
      "[image-search] vision parse →",
      parse
        ? {
            barcode: parse.barcode_value || null,
            brand: parse.brand || null,
            package_form: parse.package_form || null,
            family: parse.core_product_family || null,
            product_type: parse.product_type || null,
            product_type_confidence: parse.product_type_confidence,
            product_name: parse.product_name || null,
            variant: parse.variant || null,
            size: parse.size || null,
            count: parse.count || null,
            confidence: parse.confidence,
          }
        : "INVALID_JSON",
    );

    if (!parse) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
      });
    }

    // ---------------------------------------------------------------
    // Vision-read barcode (only when explicitly detected — no false positives)
    // ---------------------------------------------------------------
    if (parse.barcode_detected && parse.barcode_value) {
      const seed = await client.resolveCatalogItem(parse.barcode_value).catch(() => null);
      if (seed) {
        console.log(
          `[image-search] vision barcode ${parse.barcode_value} resolved → ${seed.asin} :: ${seed.title.slice(0, 90)}`,
        );
        const parseFromBarcode = buildVisionParseFromCatalogSeed(seed);
        const grouped = await collectFamilyResults({
          client,
          parse: parseFromBarcode,
          seed,
          seedReason: "exact barcode match",
        });
        return NextResponse.json({
          ok: true,
          results: grouped.results.slice(0, Math.max(pageSize, grouped.results.length)),
          derivedQuery: parse.barcode_value,
          matchPath: "barcode",
          visionParse: parse,
        });
      }
      console.log(
        `[image-search] vision barcode ${parse.barcode_value} → not in catalog; falling back to packaging identity`,
      );
    }

    // ---------------------------------------------------------------
    // Image / packaging identity (strict — no broad search)
    // ---------------------------------------------------------------
    if (!imageIdentityIsUsable(parse)) {
      console.log(
        `[image-search] image unusable (confidence=${parse.confidence}) with insufficient identity signals`,
      );
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: derivedQuery || null,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
        visionParse: parse,
      });
    }

    const typeMode = inferTypeMode(parse);

    if (!parse.core_product_family.trim()) {
      console.log("[image-search] vision returned no core_product_family → not listed");
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: derivedQuery || null,
        notFoundOnAmazon: true,
        notice: NOTICE_NOT_ON_AMAZON,
        visionParse: parse,
      });
    }

    /**
     * Without a brand anchor we need the product family to be specific enough on its own.
     * Generic 1–2 token families like "Hair Care", "Lotion", "Soap" match thousands of
     * unrelated SKUs — refuse to guess.
     */
    const familyTokenList = familyTokens(parse.core_product_family);
    const typeTokenList = familyTokens(parse.product_type);
    if (!parse.brand.trim() && familyTokenList.length < 2 && typeTokenList.length < 2) {
      console.log(
        `[image-search] no brand + generic family "${parse.core_product_family}" → unclear / not specific enough`,
      );
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: derivedQuery || null,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
        visionParse: parse,
      });
    }

    const keyword =
      derivedQuery.trim() ||
      [parse.brand, parse.core_product_family, parse.product_type].filter(Boolean).join(" ").trim();
    if (!keyword) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
        visionParse: parse,
      });
    }

    const rawItems = await client.searchCatalogByKeywordMultiple(keyword, FAMILY_SEARCH_FETCH_CAP);
    console.log(`[image-search] identity "${keyword}" → ${rawItems.length} catalog hits`);

    const packageBrand = strictPackageBrandFromVision(parse.brand);
    const log: ScanLogEntry[] = [];

    const strictCandidates: CatalogItem[] = [];
    const relaxedCandidates: CatalogItem[] = [];
    const softFamilyRequired = parse.core_product_family.trim().length > 0;
    for (const item of rawItems) {
      if (!item.asin) continue;
      if (!strictCatalogBrandMatch(item.brand, packageBrand)) {
        log.push({
          asin: item.asin,
          title: item.title,
          status: "rejected",
          reason: `brand mismatch (catalog="${item.brand}" vs package="${packageBrand}")`,
        });
        continue;
      }
      const familyMatch = softFamilyRequired
        ? catalogTitleMatchesProductFamily(item.title, parse.core_product_family)
        : false;
      const visibleCueMatch = titleMatchesVisibleText(item.title, parse.visible_text);
      const productNameCue = parse.product_name.trim()
        ? item.title.toLowerCase().includes(parse.product_name.trim().toLowerCase())
        : false;
      const familyOrCue = familyMatch || visibleCueMatch || productNameCue;
      if (!familyOrCue) {
        log.push({
          asin: item.asin,
          title: item.title,
          status: "rejected",
          reason: "same brand, different product line",
        });
        continue;
      }
      if (isLikelyCrossProductBundleTitle(item.title, parse)) {
        log.push({
          asin: item.asin,
          title: item.title,
          status: "rejected",
          reason: "bundle/combo listing does not match standalone scanned product",
        });
        continue;
      }

      const strictTypeMatch = parse.product_type.trim()
        ? catalogTitleMatchesAuxProductType(item.title, parse.product_type)
        : true;
      const titleType = detectCatalogCanonicalProductType(item.title);
      const clearlyWrongType =
        Boolean(parse.product_type.trim()) &&
        Boolean(titleType) &&
        titleType !== parse.product_type;

      // Strict set (preferred): full family + type lock when confidence is high/medium.
      const strictByType =
        typeMode === "high" ? strictTypeMatch : typeMode === "medium" ? !clearlyWrongType : true;
      if (familyMatch && strictByType) {
        strictCandidates.push(item);
      }

      // Relaxed set (fallback): keep family/cue + brand, only reject clearly wrong type at high confidence.
      if (typeMode === "high" && clearlyWrongType) {
        log.push({
          asin: item.asin,
          title: item.title,
          status: "rejected",
          reason: "clearly wrong product type",
        });
        continue;
      }
      relaxedCandidates.push(item);
    }

    const candidates = strictCandidates.length > 0 ? strictCandidates : relaxedCandidates;
    const usedRelaxedFilter = strictCandidates.length === 0 && relaxedCandidates.length > 0;
    if (candidates.length === 0) {
      logScanResults("family filter (no matches)", log);
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery,
        notFoundOnAmazon: true,
        notice: NOTICE_NOT_ON_AMAZON,
        visionParse: parse,
      });
    }
    if (usedRelaxedFilter) {
      console.log("[image-search] strict filter empty; using relaxed fallback constraints");
    }

    // Pick the seed: the candidate whose title best matches family + variant.
    const seed = pickFamilySeed(candidates, parse);
    const lineFiltered = candidates.filter(
      (it) => it.asin === seed.asin || catalogItemSameProductFamilyLine(seed, it),
    );
    for (const it of candidates) {
      if (lineFiltered.some((x) => x.asin === it.asin)) continue;
      log.push({
        asin: it.asin,
        title: it.title,
        status: "rejected",
        reason: "different product line vs best seed",
      });
    }

    const grouped = await collectFamilyResults({
      client,
      parse,
      seed,
      seedReason: "same product family - exact",
      candidatePool: lineFiltered,
      log,
    });

    logScanResults("family filter", log);
    return NextResponse.json({
      ok: true,
      results: grouped.results.slice(0, Math.max(pageSize, grouped.results.length)),
      derivedQuery,
      matchPath: "family",
      lowConfidenceType: typeMode !== "high",
      usedRelaxedFilter,
      visionParse: parse,
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

/**
 * Pick the catalog row that best represents the EXACT product from the photo:
 * variant / size / scent in title takes precedence over generic family-only matches.
 */
function pickFamilySeed(items: CatalogItem[], parse: VisionProductFamilyParse): CatalogItem {
  const scoreFor = (title: string): number => {
    const t = title.toLowerCase();
    let s = 0;
    const bits = [parse.variant, parse.flavor_scent_color, parse.size, parse.product_name].filter(Boolean);
    for (const bit of bits) {
      const tokens = familyTokens(bit);
      if (tokens.length === 0) continue;
      const hits = tokens.filter((tok) => t.includes(tok)).length;
      if (hits > 0) s += hits;
      if (tokens.length > 0 && hits === tokens.length) s += 2; // full phrase match
    }
    if (parse.model_number && t.includes(parse.model_number.toLowerCase())) s += 5;
    // Prefer non-multipack as the seed when photo shows a single unit.
    if (!detectMultipackInTitle(title) && (!parse.count || parse.count.trim() === "1")) s += 1;
    if (isLikelyCrossProductBundleTitle(title, parse)) s -= 8;
    if (/\b(single|1\s*count|1ct|one\s*pack)\b/.test(t)) s += 2;
    const familyTokensStrict = familyTokens(parse.core_product_family);
    if (familyTokensStrict.length > 0) {
      const familyHits = familyTokensStrict.filter((tok) => t.includes(tok)).length;
      if (familyHits === familyTokensStrict.length) s += 3;
    }
    return s;
  };
  let best = items[0]!;
  let bestScore = -1;
  for (const it of items) {
    const s = scoreFor(it.title);
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return best;
}

/**
 * Build the final, grouped result set for a given seed product:
 * - the seed (exact)
 * - other rows that match the same product family (variations / multipacks)
 *
 * If `candidatePool` is provided, that pool is used directly. Otherwise we fetch
 * additional rows by the seed's title prefix (used by the barcode path so we still
 * surface variations).
 */
async function collectFamilyResults(opts: {
  client: Awaited<ReturnType<typeof getSpApiClientForUserOrGlobal>>;
  parse: VisionProductFamilyParse;
  seed: CatalogItem;
  seedReason: string;
  candidatePool?: CatalogItem[];
  log?: ScanLogEntry[];
}): Promise<{ results: ProductAnalysis[]; usedAmazonVariationFamily: boolean }> {
  const { client, parse, seed, seedReason } = opts;
  if (!client) return { results: [], usedAmazonVariationFamily: false };

  const log = opts.log ?? [];
  const packageBrand = strictPackageBrandFromVision(parse.brand);

  let pool: CatalogItem[];
  let usedAmazonVariationFamily = false;
  const relationFamily = await client.resolveVariationFamilyItems(seed.asin, FAMILY_SEARCH_FETCH_CAP).catch(() => null);
  if (relationFamily && relationFamily.items.length > 0) {
    pool = relationFamily.items;
    usedAmazonVariationFamily = relationFamily.resolved;
    console.log(
      `[image-search] expanded family for ${seed.asin} → ${pool.length} related rows (${relationFamily.resolved ? "relationship graph" : "heuristic expansion"})`,
    );
  } else if (opts.candidatePool && opts.candidatePool.length > 0) {
    pool = opts.candidatePool;
  } else {
    const expandKeyword = seed.title.slice(0, 72).trim();
    const expanded = expandKeyword.length >= 6
      ? await client.searchCatalogByKeywordMultiple(expandKeyword, FAMILY_SEARCH_FETCH_CAP)
      : [];
    const unique = new Map<string, CatalogItem>();
    unique.set(seed.asin, seed);
    /** When expanding by seed title, anchor to the seed's own brand if the package brand wasn't readable. */
    const expandBrandAnchor = packageBrand ?? (seed.brand ? seed.brand : null);
    for (const it of expanded) {
      if (!it.asin || unique.has(it.asin)) continue;
      if (!strictCatalogBrandMatch(it.brand, expandBrandAnchor)) {
        log.push({
          asin: it.asin,
          title: it.title,
          status: "rejected",
          reason: `brand mismatch (catalog="${it.brand}" vs anchor="${expandBrandAnchor ?? ""}")`,
        });
        continue;
      }
      const familyForExpand = parse.core_product_family || seed.title;
      const familyStrOk = catalogTitleMatchesProductFamily(it.title, familyForExpand);
      const lineOk = catalogItemSameProductFamilyLine(seed, it);
      if (!familyStrOk && !lineOk) {
        log.push({
          asin: it.asin,
          title: it.title,
          status: "rejected",
          reason: "same brand, different product line",
        });
        continue;
      }
      unique.set(it.asin, it);
    }
    pool = [...unique.values()];
  }

  /** Final guard: same manufacturer line as resolved seed (drops same-brand catalog noise). */
  const anchored = new Map<string, CatalogItem>();
  anchored.set(seed.asin, seed);
  for (const it of pool) {
    if (!it.asin || it.asin === seed.asin) continue;
    if (!catalogBrandsCompatibleForFamily(seed.brand ?? "", it.brand ?? "")) {
      log.push({
        asin: it.asin,
        title: it.title,
        status: "rejected",
        reason: "brand mismatch vs seed catalog row",
      });
      continue;
    }
    if (!catalogItemSameProductFamilyLine(seed, it)) {
      log.push({
        asin: it.asin,
        title: it.title,
        status: "rejected",
        reason: "different product line vs seed",
      });
      continue;
    }
    if (parse.product_type.trim() && !catalogTitleMatchesAuxProductType(it.title, parse.product_type)) {
      log.push({
        asin: it.asin,
        title: it.title,
        status: "rejected",
        reason: "different product type vs seed line",
      });
      continue;
    }
    anchored.set(it.asin, it);
  }
  pool = [...anchored.values()];

  const seen = new Set<string>();
  const seedAsin = seed.asin;
  const ordered: Array<{
    item: CatalogItem;
    group: "exact" | "variation" | "multipack" | "possible_related";
    reason: string;
  }> = [];

  const exactReason = seedReason === "exact barcode match" ? "Exact scanned product" : seedReason;
  ordered.push({ item: seed, group: "exact", reason: exactReason });
  seen.add(seedAsin);
  log.push({ asin: seedAsin, title: seed.title, status: "accepted", reason: exactReason });

  for (const item of pool) {
    if (!item.asin || seen.has(item.asin)) continue;
    const cls = classifyFamilyMatch(item, parse);
    const group = usedAmazonVariationFamily ? cls.group : "possible_related";
    const reason = usedAmazonVariationFamily
      ? cls.reason
      : `possible related listing (family graph unavailable) - ${cls.reason}`;
    seen.add(item.asin);
    ordered.push({ item, group, reason });
    log.push({ asin: item.asin, title: item.title, status: "accepted", reason });
  }

  const sorted = sortByFamilyMatchGroup(ordered);
  const results = sorted.map(({ item, group, reason }) =>
    buildCatalogOnlyResult(item, parse.product_name || parse.core_product_family || seed.title, {
      group,
      reason,
    }),
  );
  return { results, usedAmazonVariationFamily };
}
