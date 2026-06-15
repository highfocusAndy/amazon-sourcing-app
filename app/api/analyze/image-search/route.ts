import { NextRequest, NextResponse } from "next/server";

import { userKeywordSearchLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  CONNECT_AMAZON_FOR_SP_API_MESSAGE,
  getSpApiClientForUser,
  hasConnectedAmazonAccount,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import type { CatalogItem } from "@/lib/spApiClient";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import {
  buildStableAmazonIdentityQuery,
  catalogBrandsCompatibleForFamily,
  catalogItemSameProductFamilyLine,
  catalogTitleMatchesAuxProductType,
  catalogTitleMatchesProductFamily,
  classifyFamilyMatch,
  detectMultipackInTitle,
  familyTokens,
  parseVisionProductFamilyJson,
  sortByFamilyMatchGroup,
  type VisionProductFamilyParse,
} from "@/lib/imageSearchRanking";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Cap on rows we'll fetch from SP-API and consider for family matching. */
const FAMILY_SEARCH_FETCH_CAP = 100;
/** Extremely low vision confidence means the image is unusable. */
const MIN_USABLE_IMAGE_CONFIDENCE = 0.05;
const FALLBACK_VISIBLE_TEXT_LIMIT = 4;

const NOTICE_UNCLEAR =
  "Unable to confidently identify the product. Please rescan.";
const VISION_PROMPT = `You analyze one retail product photo. Extract the most stable product identity for Amazon lookup (works for ANY category: electronics, home, grocery, beauty, tools, etc.).

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

- "package_form": Best physical form if visible (examples: "keyboard", "mouse", "laptop", "monitor", "tube", "pump bottle", "jar", "box"), or "" if unclear.

- "product_type": short product category/type noun (examples: "keyboard", "mouse", "laptop", "charger", "shampoo", "lotion", "headphones"). Keep concise and literal.

- "product_type_confidence": 0..1 confidence for product_type only. Keep low when uncertain, blurred, or conflicting cues.

- "core_product_family": specific item/category identity from visible cues. Prefer concrete nouns (e.g. "wireless keyboard", "mechanical keyboard", "usb-c charger", "daily moisture lotion"). Never output only the brand.

- "product_name": Full front-of-pack marketing name if readable.

- "variant", "size", "count", "flavor_scent_color", "model_number": Only when printed.

- "visible_text": Up to 10 short phrases EXACTLY as printed on the package (for audit only — NOT a keyword list for search). No invented phrases.

- "confidence": 0..1 overall product identity confidence. Use ≤ 0.15 when blurry/dark/partial/not a product. Use ≤ 0.35 when you cannot read both a credible brand OR a specific product line. Never output high confidence from guessing.

If unusable, return empty strings, false barcode, "confidence": 0.`;

const VISION_RESCUE_PROMPT = `You analyze one retail product photo and return a COARSE SHAPE/TYPE guess when full identity is unreadable.

Return ONLY valid JSON (no markdown) with this exact shape:
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

Rules:
- Prioritize estimating only "package_form" and "product_type" from silhouette/container shape even when text is unreadable.
- "package_form" one of: "pump bottle", "tube", "tall bottle", "oil bottle", "jar", or "".
- "product_type" one of: "lotion","shampoo","conditioner","oil","cream","cleanser", or "" when impossible.
- Keep confidence low unless clear.
- Leave brand/family/name empty unless clearly readable.
- If no product is visible, return empty fields with confidence 0.`;

const VISION_BEST_GUESS_SHAPE_PROMPT = `You analyze one retail product photo and output your BEST-GUESS coarse packaging/type even when text is unreadable.

Return ONLY valid JSON (no markdown) with this exact shape:
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

Rules:
- If a product container is visible, choose the closest "package_form" and "product_type" guess even at low confidence.
- "package_form" must be one of: "pump bottle", "tube", "tall bottle", "oil bottle", "jar", or "".
- "product_type" must be one of: "lotion","shampoo","conditioner","oil","cream","cleanser", or "".
- Keep "product_type_confidence" and "confidence" low when uncertain (e.g. 0.15-0.4).
- Set "core_product_family" to a coarse object/category noun when possible from silhouette/keys/layout/shape
  (examples: "keyboard", "mouse", "laptop", "headphones", "webcam", "phone case", "charger", "monitor").
- Keep brand/family/name empty unless clearly readable.
- Only return all-empty fields when there is no visible product package at all.`;

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

type ScanLogEntry = {
  asin: string;
  title: string;
  status: "accepted" | "rejected";
  reason: string;
};

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

function buildFallbackIdentityQuery(parse: VisionProductFamilyParse): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    const normalized = value.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(normalized);
  };
  push(parse.brand);
  push(parse.product_name);
  push(parse.product_type);
  push(parse.variant);
  for (const cue of parse.visible_text.slice(0, FALLBACK_VISIBLE_TEXT_LIMIT)) {
    if (cue.trim().length < 4) continue;
    push(cue);
  }
  return parts.join(" ").slice(0, 160).trim();
}

function isBrandOnlyFallbackQuery(query: string, brand: string): boolean {
  const q = query.trim().toLowerCase();
  const b = brand.trim().toLowerCase();
  if (!q || !b) return false;
  return q === b;
}

function nonBrandKeywordTokens(query: string, brand: string): string[] {
  const brandTokens = new Set(familyTokens(brand));
  return familyTokens(query).filter((tok) => !brandTokens.has(tok));
}

const PRODUCT_TYPE_TOKENS = ["lotion", "shampoo", "conditioner", "oil", "cream", "cleanser"] as const;

function packageFormSearchTokens(packageForm: string): string[] {
  const f = packageForm.trim().toLowerCase();
  if (!f) return [];
  if (f === "pump bottle") return ["pump", "bottle"];
  if (f === "tube") return ["tube"];
  if (f === "tall bottle") return ["bottle"];
  if (f === "oil bottle") return ["oil", "bottle"];
  if (f === "jar") return ["jar"];
  return [];
}

function titleMatchesPackageForm(title: string, packageForm: string): boolean {
  const tokens = packageFormSearchTokens(packageForm);
  if (tokens.length === 0) return true;
  const t = title.toLowerCase();
  return tokens.every((tok) => t.includes(tok));
}

async function requestVisionParse(opts: {
  apiKey: string;
  dataUrl: string;
  visionModel: string;
  visionDetail: "low" | "high";
  prompt: string;
  maxTokens?: number;
}): Promise<VisionProductFamilyParse | null> {
  const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.visionModel,
      max_tokens: opts.maxTokens ?? 700,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: opts.prompt },
            { type: "image_url", image_url: { url: opts.dataUrl, detail: opts.visionDetail } },
          ],
        },
      ],
    }),
  });
  if (!oaiRes.ok) return null;
  const completion = (await oaiRes.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
  return parseVisionProductFamilyJson(raw);
}

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

    if (!(await userKeywordSearchLimit(gate.userId))) {
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

    const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
    if (!hasAmazon) {
      return NextResponse.json(
        {
          ok: false,
          error: CONNECT_AMAZON_FOR_SP_API_MESSAGE,
          results: [],
        },
        { status: 403 },
      );
    }

    const client = await getSpApiClientForUser(gate.userId);
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
      const allFromForm = await client.resolveAllCatalogItems(formBarcodeDigits).catch(() => []);
      if (allFromForm.length > 0) {
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
        console.log(
          `[image-search] form barcode ${formBarcodeDigits} → ${allFromForm.length} catalog match(es): ${allFromForm.map((i) => i.asin).join(", ")}`,
        );
        const results = allFromForm.map((item) =>
          buildCatalogOnlyResult(item, formBarcodeDigits, { group: "exact", reason: "Exact barcode match" }),
        );
        return NextResponse.json({
          ok: true,
          results,
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
    // Default to "low" detail — significantly faster and cheaper; readable product labels
    // still come through clearly. Set OPENAI_VISION_DETAIL=high to override when needed.
    const visionDetail: "low" | "high" =
      process.env.OPENAI_VISION_DETAIL?.trim().toLowerCase() === "high" ? "high" : "low";

    const primaryRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        max_tokens: 450,
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

    if (!primaryRes.ok) {
      const detail = await primaryRes.text();
      return NextResponse.json(
        {
          ok: false,
          error: `Image understanding request failed (${primaryRes.status}).`,
          detail: detail.slice(0, 500),
          results: [],
        },
        { status: 502 },
      );
    }

    const completion = (await primaryRes.json()) as {
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
      const allFromVision = await client.resolveAllCatalogItems(parse.barcode_value).catch(() => []);
      if (allFromVision.length > 0) {
        console.log(
          `[image-search] vision barcode ${parse.barcode_value} → ${allFromVision.length} catalog match(es): ${allFromVision.map((i) => i.asin).join(", ")}`,
        );
        const results = allFromVision.map((item) =>
          buildCatalogOnlyResult(item, parse.barcode_value, { group: "exact", reason: "Exact barcode match" }),
        );
        return NextResponse.json({
          ok: true,
          results,
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
      const rescueParse = await requestVisionParse({
        apiKey,
        dataUrl,
        visionModel,
        visionDetail: "high",
        prompt: VISION_RESCUE_PROMPT,
        maxTokens: 420,
      });
      const guessParse =
        rescueParse && (rescueParse.product_type.trim() || rescueParse.package_form.trim())
          ? rescueParse
          : await requestVisionParse({
              apiKey,
              dataUrl,
              visionModel,
              visionDetail: "high",
              prompt: VISION_BEST_GUESS_SHAPE_PROMPT,
              maxTokens: 420,
            });
      if (guessParse && (guessParse.product_type.trim() || guessParse.package_form.trim())) {
        console.log("[image-search] rescue/guess parse produced coarse shape cues", {
          package_form: guessParse.package_form || null,
          product_type: guessParse.product_type || null,
          product_type_confidence: guessParse.product_type_confidence,
          confidence: guessParse.confidence,
        });
        console.log("[image-search] primary parse unusable; rescue pass produced shape/type cues");
        parse = {
          ...parse,
          product_type: guessParse.product_type || parse.product_type,
          product_type_confidence: Math.max(parse.product_type_confidence, guessParse.product_type_confidence),
          package_form: guessParse.package_form || parse.package_form,
          core_product_family: guessParse.core_product_family || parse.core_product_family,
          product_name: guessParse.product_name || parse.product_name,
          variant: guessParse.variant || parse.variant,
          visible_text: guessParse.visible_text.length > 0 ? guessParse.visible_text : parse.visible_text,
          confidence: Math.max(parse.confidence, guessParse.confidence),
        };
      } else {
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
    }

    const universalKeyword =
      buildStableAmazonIdentityQuery(parse).trim() || buildFallbackIdentityQuery(parse).trim();
    const brandOnlyUniversal = isBrandOnlyFallbackQuery(universalKeyword, parse.brand);
    const universalKeywordParts = [
      parse.core_product_family.trim(),
      parse.product_name.trim(),
      parse.product_type.trim(),
      parse.variant.trim(),
      parse.size.trim(),
      ...parse.visible_text.slice(0, 3).map((x) => x.trim()),
      ...packageFormSearchTokens(parse.package_form),
    ].filter(Boolean);
    const universalFallbackKeyword = universalKeywordParts.join(" ").trim();
    const searchKeyword =
      universalKeyword && !brandOnlyUniversal ? universalKeyword : universalFallbackKeyword;
    if (!searchKeyword) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
        visionParse: parse,
      });
    }

    const rawUniversalItems = await client.searchCatalogByKeywordMultiple(searchKeyword, FAMILY_SEARCH_FETCH_CAP);
    const semanticTokens = nonBrandKeywordTokens(searchKeyword, parse.brand);
    const universalCandidates = rawUniversalItems.filter((item) => {
      if (!item.asin) return false;
      if (semanticTokens.length > 0) {
        const titleLower = item.title.toLowerCase();
        const semanticHit = semanticTokens.some((tok) => titleLower.includes(tok));
        if (!semanticHit) return false;
      }
      const familyCue = parse.core_product_family.trim()
        ? catalogTitleMatchesProductFamily(item.title, parse.core_product_family)
        : false;
      const productNameCue = parse.product_name.trim()
        ? item.title.toLowerCase().includes(parse.product_name.trim().toLowerCase())
        : false;
      const visibleCue = titleMatchesVisibleText(item.title, parse.visible_text);
      const typeCue = parse.product_type.trim()
        ? catalogTitleMatchesAuxProductType(item.title, parse.product_type)
        : false;
      const formCue = parse.package_form.trim() ? titleMatchesPackageForm(item.title, parse.package_form) : false;
      return familyCue || productNameCue || visibleCue || typeCue || formCue;
    });
    if (universalCandidates.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: searchKeyword,
        imageUnclear: true,
        notice: NOTICE_UNCLEAR,
        visionParse: parse,
      });
    }

    const seed = pickFamilySeed(universalCandidates, parse);
    const grouped = await collectFamilyResults({
      client,
      parse: {
        ...parse,
        core_product_family:
          parse.core_product_family.trim() || parse.product_name.trim() || seed.title.slice(0, 80).trim(),
      },
      seed,
      seedReason: "visual exact match",
    });
    return NextResponse.json({
      ok: true,
      results: grouped.results.slice(0, Math.max(pageSize, grouped.results.length)),
      derivedQuery: searchKeyword,
      matchPath: "family",
      lowConfidenceType: true,
      usedRelaxedFilter: true,
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
 * - only the true variations of that product (size, color, scent, pack count)
 *
 * Strategy:
 * 1. Use Amazon's official variation family exclusively when available — no augmentation.
 * 2. When no variation family is returned, fall back to a narrow title-based search
 *    with a strict same-line filter (0.68 Jaccard) to avoid cross-product brand noise.
 */
async function collectFamilyResults(opts: {
  client: Awaited<ReturnType<typeof getSpApiClientForUser>>;
  parse: VisionProductFamilyParse;
  seed: CatalogItem;
  seedReason: string;
  log?: ScanLogEntry[];
}): Promise<{ results: ProductAnalysis[]; usedAmazonVariationFamily: boolean }> {
  const { client, parse, seed, seedReason } = opts;
  if (!client) return { results: [], usedAmazonVariationFamily: false };

  const log = opts.log ?? [];

  let pool: CatalogItem[];
  let usedAmazonVariationFamily = false;

  // Build the candidate pool — both calls run in parallel for speed:
  // 1. Amazon's official variation graph (trusted, no filtering needed).
  // 2. Seed-title keyword search to catch variations Amazon's graph missed.
  //    We search by the seed TITLE, not the broad vision query, so results stay product-specific.
  const expandKeyword = seed.title.slice(0, 60).trim();
  const [relationFamily, expandedRaw] = await Promise.all([
    client.resolveVariationFamilyItems(seed.asin, FAMILY_SEARCH_FETCH_CAP).catch(() => null),
    expandKeyword.length >= 6
      ? client.searchCatalogByKeywordMultiple(expandKeyword, FAMILY_SEARCH_FETCH_CAP).catch(() => [] as CatalogItem[])
      : Promise.resolve([] as CatalogItem[]),
  ]);

  const variationFamilyAsins = new Set<string>();
  const unique = new Map<string, CatalogItem>();
  unique.set(seed.asin, seed);

  if (relationFamily && relationFamily.items.length > 0) {
    for (const it of relationFamily.items) {
      if (!it.asin) continue;
      variationFamilyAsins.add(it.asin);
      unique.set(it.asin, it);
    }
    usedAmazonVariationFamily = relationFamily.resolved;
  }

  for (const it of expandedRaw) {
    if (!it.asin) continue;
    unique.set(it.asin, it);
  }

  pool = [...unique.values()];
  console.log(
    `[image-search] pool for ${seed.asin} → ${pool.length} candidates (variation graph: ${variationFamilyAsins.size}, seed-title expansion)`,
  );

  /** Final guard: brand match required for all; same-line check for keyword-added items. */
  const anchored = new Map<string, CatalogItem>();
  anchored.set(seed.asin, seed);
  for (const it of pool) {
    if (!it.asin || it.asin === seed.asin) continue;
    if (!catalogBrandsCompatibleForFamily(seed.brand ?? "", it.brand ?? "")) {
      log.push({ asin: it.asin, title: it.title, status: "rejected", reason: "brand mismatch vs seed" });
      continue;
    }
    // Items from Amazon's confirmed variation graph are trusted as-is.
    if (variationFamilyAsins.has(it.asin)) {
      anchored.set(it.asin, it);
      continue;
    }
    // Items added via keyword search need same-line filtering to block other product lines.
    if (!catalogItemSameProductFamilyLine(seed, it)) {
      log.push({ asin: it.asin, title: it.title, status: "rejected", reason: "different product line vs seed" });
      continue;
    }
    if (parse.product_type.trim() && !catalogTitleMatchesAuxProductType(it.title, parse.product_type)) {
      log.push({ asin: it.asin, title: it.title, status: "rejected", reason: "different product type vs seed" });
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
    const group = cls.group;
    const reason = usedAmazonVariationFamily
      ? cls.reason
      : `${cls.reason} (inferred — catalog variation links incomplete)`;
    seen.add(item.asin);
    ordered.push({ item, group, reason });
    log.push({ asin: item.asin, title: item.title, status: "accepted", reason });
  }

  const sorted = sortByFamilyMatchGroup(ordered);
  // If the scan found any variations/multipacks, every item in this scan is part of a variation
  // family — mark them all as such so the UI shows "Yes" consistently.
  const foundVariations = sorted.some((r) => r.group === "variation" || r.group === "multipack");
  const inputLabel = parse.product_name || parse.core_product_family || seed.title;
  const results = sorted.map(({ item, group, reason }) =>
    buildCatalogOnlyResult(
      item,
      inputLabel,
      { group, reason },
      foundVariations ? { hasVariations: true } : undefined,
    ),
  );
  return { results, usedAmazonVariationFamily };
}
