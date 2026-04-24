import type { CatalogItem } from "@/lib/spApiClient";

/** Pull JSON object from model output (handles ```json fences). */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

export type VisionProductParse = {
  query: string;
  match_hints: string[];
  /** Brand as printed on the package (used to rank Amazon catalog brand field + title). */
  brand?: string;
  /** UPC/EAN digits only, if clearly visible on the label. */
  upc_ean?: string;
  /**
   * Optional coarse bucket when it fits: spray | hanging_tree | vent_clip | wipes | unknown.
   * Use **unknown** for most categories (electronics, toys, food, etc.) — rely on format_keywords instead.
   */
  product_form?: string;
  /**
   * Phrases for **physical product type / container / material shape** only (any category).
   * Do not use pack count, bundle size, or “single” here — those belong in match_hints; including them hides multipack ASINs.
   */
  format_keywords?: string[];
};

/**
 * Structured vision output keyed on **product family** identification (the new scan flow).
 * The model fills these from the photo so the catalog search can match the exact product line,
 * not just the brand. See `parseVisionProductFamilyJson`.
 */
export type VisionProductFamilyParse = {
  /** True when the model found a printed barcode on the package (UPC/EAN/GTIN). */
  barcode_detected: boolean;
  /** Digits only (8–14). Empty when no barcode is readable. */
  barcode_value: string;
  /** Brand as printed (empty for generic / unbranded products). */
  brand: string;
  /** Canonical product type: lotion | shampoo | conditioner | oil | cream | cleanser. */
  product_type: string;
  /** 0..1 confidence for `product_type` specifically (separate from overall confidence). */
  product_type_confidence: number;
  /** Optional container cue from packaging shape (pump bottle, tube, tall bottle, oil bottle, jar). */
  package_form: string;
  /**
   * Core product line / type words from the package, brand stripped out.
   * Example: "Hand Soap", "Hair Shampoo", "Phone Case for iPhone 15", "Vitamin C Gummies".
   */
  core_product_family: string;
  /** Full marketing name on the front of the package (more specific than family). */
  product_name: string;
  /** Variant label printed on the package: scent / flavor / color / model. */
  variant: string;
  /** Net weight / volume / size with units (e.g. "12 fl oz", "200 g", "6.7 inch"). */
  size: string;
  /** Pack count from the package ("1", "2", "12 count", "Pack of 3"). */
  count: string;
  /** Free-text flavor / scent / color when separate from `variant`. */
  flavor_scent_color: string;
  /** Model number / SKU when printed on the box. */
  model_number: string;
  /** Other distinctive printed words (used as backup when family is short). */
  visible_text: string[];
  /** 0..1 confidence the model can identify this product reliably. */
  confidence: number;
};

/**
 * Use for **strict** catalog filtering only when the vision model read a brand from the photo.
 * Do not infer a brand from the search query — generic queries like "clear phone case iPhone 15"
 * used to pick "clear" or "phone" as a fake brand and returned zero results.
 */
export function strictPackageBrandFromVision(parsedBrand: string | undefined): string | null {
  const pb = parsedBrand?.trim();
  return pb || null;
}

/** True if the catalog row is likely this manufacturer (title or Amazon brand field). */
export function catalogItemMatchesPackageBrand(item: CatalogItem, brand: string): boolean {
  const needle = brand.trim().toLowerCase();
  if (needle.length < 2) return true;
  const t = item.title.toLowerCase();
  const cb = item.brand.trim().toLowerCase();
  if (t.includes(needle)) return true;
  if (cb.includes(needle) || needle.includes(cb)) return true;
  return false;
}

/**
 * Aligns with `/api/analyze/variations`: when both rows have a catalog brand, they must match;
 * if either is missing, do not exclude (title + package-brand filter already applied).
 */
export function catalogBrandCompatibleWithSeed(seed: CatalogItem, item: CatalogItem): boolean {
  const a = (seed.brand || "").trim().toLowerCase();
  const b = (item.brand || "").trim().toLowerCase();
  if (!a || !b) return true;
  return a === b;
}

/**
 * Parse the structured product-family JSON the new vision prompt returns.
 * Returns null on invalid JSON. Always coerces to safe shapes (no NaN, trimmed strings,
 * digits-only barcode), so the route can pass it straight into matching.
 */
export function parseVisionProductFamilyJson(content: string): VisionProductFamilyParse | null {
  const blob = extractJsonObject(content) ?? content.trim();
  try {
    const o = JSON.parse(blob) as Record<string, unknown>;
    const str = (k: string): string => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
    const num = (k: string): number => {
      const v = o[k];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(n)) return 0;
      if (n < 0) return 0;
      if (n > 1) return Math.min(1, n / 100); // tolerate 0..100
      return n;
    };
    const arr = (k: string): string[] =>
      Array.isArray(o[k])
        ? (o[k] as unknown[])
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const barcodeRaw = str("barcode_value").replace(/\D/g, "");
    const normalizedType = normalizeVisionProductType(str("product_type"));
    return {
      barcode_detected: o.barcode_detected === true || (barcodeRaw.length >= 8 && barcodeRaw.length <= 14),
      barcode_value: barcodeRaw.length >= 8 && barcodeRaw.length <= 14 ? barcodeRaw : "",
      brand: str("brand"),
      product_type: normalizedType ?? "",
      product_type_confidence: num("product_type_confidence"),
      package_form: str("package_form"),
      core_product_family: str("core_product_family"),
      product_name: str("product_name"),
      variant: str("variant"),
      size: str("size"),
      count: str("count"),
      flavor_scent_color: str("flavor_scent_color"),
      model_number: str("model_number"),
      visible_text: arr("visible_text").slice(0, 20),
      confidence: num("confidence"),
    };
  } catch {
    return null;
  }
}

export function parseVisionProductJson(content: string): VisionProductParse | null {
  const blob = extractJsonObject(content) ?? content.trim();
  try {
    const o = JSON.parse(blob) as {
      query?: unknown;
      match_hints?: unknown;
      brand?: unknown;
      upc_ean?: unknown;
      product_form?: unknown;
      format_keywords?: unknown;
    };
    const query = typeof o.query === "string" ? o.query.trim() : "";
    const match_hints = Array.isArray(o.match_hints)
      ? o.match_hints
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const brand = typeof o.brand === "string" ? o.brand.trim() : "";
    const upcRaw = typeof o.upc_ean === "string" ? o.upc_ean.replace(/\D/g, "") : "";
    if (!query) return null;
    const out: VisionProductParse = { query, match_hints };
    if (brand) out.brand = brand;
    if (upcRaw.length >= 8 && upcRaw.length <= 14) out.upc_ean = upcRaw;
    if (typeof o.product_form === "string" && o.product_form.trim()) out.product_form = o.product_form.trim();
    if (Array.isArray(o.format_keywords)) {
      const fk = o.format_keywords
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
      if (fk.length > 0) out.format_keywords = fk;
    }
    return out;
  } catch {
    return null;
  }
}

/** Coarse physical product bucket for image search (same brand, different shapes = different ASINs). */
export type ProductFormatKind = "spray" | "hanging_tree" | "vent_clip" | "wipes";

export function parseProductFormField(raw: string | undefined | null): ProductFormatKind | null {
  const x = raw?.trim().toLowerCase();
  if (!x || x === "unknown" || x === "other") return null;
  if (/\bspray\b|spritzer|pump|aerosol|mist\s*bottle/.test(x)) return "spray";
  if (/\bhanging|paper\s*tree|fiber\s*tree|tree\s*card|cardboard\s*tree/.test(x)) return "hanging_tree";
  if (/\bvent\s*clip|ventclip/.test(x)) return "vent_clip";
  if (/\bwipe|tissue/.test(x)) return "wipes";
  return null;
}

export function inferProductFormatFromBlob(query: string, hints: string[]): ProductFormatKind | null {
  const blob = `${query} ${hints.join(" ")}`.toLowerCase();
  if (/\b(spray|spritzer|pump\s*bottle|aerosol|mist\s*bottle)\b/.test(blob)) return "spray";
  if (/\b(hanging\s+paper|paper\s+tree|hanging\s+tree|fiber\s+tree|cardboard\s+tree)\b/.test(blob))
    return "hanging_tree";
  if (/\bvent\s*clip|ventclip\b/.test(blob)) return "vent_clip";
  if (/\b(wipes?|tissue\s+pack)\b/.test(blob)) return "wipes";
  return null;
}

export function detectFormatFromCatalogTitle(title: string): ProductFormatKind | null {
  const t = title.toLowerCase();
  if (/\bhanging\s+paper|paper\s+tree\b/.test(t)) return "hanging_tree";
  if (/\bvent\s*clip|ventclip\b/.test(t)) return "vent_clip";
  if (/\b(wipes?\b|tissue\s+pack)\b/.test(t) && /\b(freshener|scent|odor)\b/.test(t)) return "wipes";
  if (/\bspray\b/.test(t)) return "spray";
  return null;
}

export function catalogTitleMatchesProductFormat(title: string, format: ProductFormatKind): boolean {
  const sig = detectFormatFromCatalogTitle(title);
  const t = title.toLowerCase();
  if (sig !== null) return sig === format;
  if (format === "spray") {
    if (/\bhanging\s+paper|paper\s+tree|fiber\s+tree\b/.test(t)) return false;
    if (/\bvent\s*clip|ventclip\b/.test(t)) return false;
    return true;
  }
  if (format === "hanging_tree") {
    if (/\bspray\b/.test(t) && !/\bhanging|paper\s+tree\b/.test(t)) return false;
    return true;
  }
  if (format === "vent_clip") {
    if (/\bhanging\s+paper|paper\s+tree\b/.test(t)) return false;
    if (/\bspray\b/.test(t) && !/\bvent|clip\b/.test(t)) return false;
    return true;
  }
  if (format === "wipes") {
    if (/\bspray\b/.test(t) && !/\bwipe|tissue|sheet\b/.test(t)) return false;
    return true;
  }
  return true;
}

export function filterByProductFormat(
  ranked: CatalogItem[],
  format: ProductFormatKind | null,
): CatalogItem[] {
  if (!format || ranked.length === 0) return ranked;
  return ranked.filter((it) => catalogTitleMatchesProductFormat(it.title, format));
}

export function sanitizeFormatKeywords(raw: unknown[] | undefined | null): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = x.trim().toLowerCase().replace(/\s+/g, " ");
    if (s.length < 2 || s.length > 48) continue;
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Remove pack / count / bundle-only phrases from vision format_keywords so filtering targets **shape** only.
 * Singles, 2-packs, 12-count, etc. stay in results as variations of the same product line.
 */
export function stripPackCountFromFormatKeywords(keywords: string[]): string[] {
  const out: string[] = [];
  for (const k of keywords) {
    const s = k.trim().toLowerCase().replace(/\s+/g, " ");
    if (s.length < 2) continue;
    if (
      /^(single|twin|triple|duo|bundle only|\d+[\s-]*(pack|pk|pks|ct|count))$/.test(s) ||
      /^pack\s+of\s*\d+$/.test(s) ||
      /^\d+\s*[-]?\s*pack$/.test(s)
    ) {
      continue;
    }
    out.push(s);
  }
  return out;
}

export function titleMatchesFormatKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const t = title.toLowerCase();
  let hits = 0;
  for (const k of keywords) {
    const x = k.trim().toLowerCase();
    if (x.length < 2) continue;
    if (t.includes(x)) hits++;
  }
  /** Slightly loose so multipack titles still match shape phrases (any product type). */
  const need = Math.max(1, Math.ceil(keywords.length * 0.45));
  return hits >= need;
}

export function titleMatchesFormatKeywordsRelaxed(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const t = title.toLowerCase();
  let hits = 0;
  for (const k of keywords) {
    const x = k.trim().toLowerCase();
    if (x.length < 2) continue;
    if (t.includes(x)) hits++;
  }
  const need = Math.max(1, Math.ceil(keywords.length * 0.35));
  return hits >= need;
}

export function narrowByFormatKeywords(
  ranked: CatalogItem[],
  keywords: string[],
): { items: CatalogItem[]; relaxed: boolean } {
  if (keywords.length === 0 || ranked.length === 0) return { items: ranked, relaxed: false };
  const strict = ranked.filter((it) => titleMatchesFormatKeywords(it.title, keywords));
  if (strict.length > 0) return { items: strict, relaxed: false };
  const relaxed = ranked.filter((it) => titleMatchesFormatKeywordsRelaxed(it.title, keywords));
  if (relaxed.length > 0) return { items: relaxed, relaxed: true };
  return { items: [], relaxed: false };
}

export function formatKeywordsFallbackFromEnum(form: ProductFormatKind | null): string[] {
  if (!form) return [];
  if (form === "spray") return ["spray"];
  if (form === "hanging_tree") return ["hanging paper", "paper tree"];
  if (form === "vent_clip") return ["vent clip"];
  if (form === "wipes") return ["wipe"];
  return [];
}

/** Infer / augment coarse form + keywords from vision text for any product category. */
export function ensurePhysicalProductFormFromBlob(
  query: string,
  hints: string[],
  formatKeywords: string[],
  productFormat: ProductFormatKind | null,
): { productFormat: ProductFormatKind | null; formatKeywords: string[] } {
  let fmt = productFormat;
  const kw = sanitizeFormatKeywords(formatKeywords);
  const blob = `${query} ${hints.join(" ")} ${kw.join(" ")}`.toLowerCase();

  const sprayCue =
    /\b(spray|spritzer|mist\s*bottle|pump\s*bottle|trigger\s*spray)\b/.test(blob) ||
    (/\b(air\s*freshener|car\s*freshener|room\s*spray|odor\s*eliminator)\b/.test(blob) &&
      /\b\d+(\.\d+)?\s*(fl\.?\s*oz|oz|ml)\b/.test(blob) &&
      !/\b(hanging|paper\s+tree|fiber\s+tree|vent\s*clip)\b/.test(blob));
  const hangingCue = /\b(hanging\s+paper|paper\s+tree|fiber\s+tree|tree\s+shape)\b/.test(blob);
  const ventCue = /\bvent\s*clip|ventclip|clip\s*on\s*vent\b/.test(blob);
  const wipesCue =
    (/\b(wet\s*)?wipes?\b|\b(tissue\s+pack|pop[\s-]?up\s*wipes|wipe\s+tub)\b/.test(blob)) &&
    !sprayCue &&
    !ventCue;

  if (wipesCue && !hangingCue) {
    fmt = fmt ?? "wipes";
    if (!kw.some((k) => /\bwipe|tissue/.test(k))) kw.push("wipe");
  } else if (ventCue && !hangingCue && !sprayCue) {
    fmt = fmt ?? "vent_clip";
    if (!kw.some((k) => k.includes("vent"))) kw.push("vent clip");
  } else if (sprayCue && !hangingCue) {
    fmt = fmt ?? "spray";
    if (!kw.some((k) => k.includes("spray"))) kw.push("spray");
  } else if (hangingCue && !sprayCue) {
    fmt = fmt ?? "hanging_tree";
    if (!kw.some((k) => k.includes("paper") || k.includes("hanging"))) {
      kw.push("hanging paper", "paper tree");
    }
  }

  return { productFormat: fmt, formatKeywords: sanitizeFormatKeywords(kw).slice(0, 8) };
}

function significantTokensFromQuery(query: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "with",
    "from",
    "amazon",
    "new",
    "pack",
  ]);
  const out: string[] = [];
  const lower = query.toLowerCase();
  for (const raw of lower.split(/\s+/)) {
    const w = raw.replace(/[^a-z0-9]/g, "");
    if (w.length > 2 && !stop.has(w)) out.push(w);
  }
  return out.slice(0, 14);
}

/** Exported for image-search expand step — only add listings that match hints, not same-brand noise. */
export function scoreTitleAgainstHints(title: string, hints: string[]): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const h of hints) {
    const x = h.trim().toLowerCase();
    if (x.length < 1) continue;
    if (!t.includes(x)) continue;
    const words = x.split(/\s+/).filter(Boolean);
    // Multi-word phrases and count/size tokens matter for single vs bundle
    const weight = words.length >= 2 ? 2 : /\d/.test(x) ? 2 : 1;
    score += weight;
  }
  return score;
}

/** Strong boost when catalog brand/title matches the package brand (cuts wrong-brand noise in e.g. "beard oil"). */
function brandAlignmentScore(brandHint: string | null | undefined, item: CatalogItem): number {
  if (!brandHint?.trim()) return 0;
  const vb = brandHint.trim().toLowerCase();
  if (vb.length < 2) return 0;
  const cb = item.brand.trim().toLowerCase();
  const tl = item.title.toLowerCase();
  if (cb && (cb === vb || cb.includes(vb) || vb.includes(cb))) return 24;
  if (tl.includes(vb)) return 14;
  return 0;
}

/** Minimum weighted hint overlap before a same-brand listing gets brand credit — avoids "any SKU from that brand". */
const MIN_HINT_SCORE_FOR_BRAND_BOOST = 4;

/**
 * Fraction of the derived query's significant tokens that must appear in a catalog title
 * before we treat that listing as the same product (vs. just same brand).
 *
 * Example: query "Olive Hair & Body Shampoo 12 oz" → significant tokens [olive, hair, body, shampoo, 12]
 *   - "Olive Oil Hair & Body Shampoo, 12 Fluid Ounce" → 5/5 = 1.00 → kept
 *   - "Olive Oil Conditioner 16 Fl Oz"               → 1/5 = 0.20 → rejected (same brand only)
 */
const MIN_QUERY_TOKEN_COVERAGE_BRANDED = 0.5;

/** Share of derived-query significant tokens that the catalog title contains. */
function queryTokenCoverage(title: string, searchQuery: string): number {
  const tokens = significantTokensFromQuery(searchQuery);
  if (tokens.length === 0) return 1;
  const t = title.toLowerCase();
  let hits = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hits++;
  }
  return hits / tokens.length;
}

/**
 * Flavor / scent / common variant words (plus a few multi-word phrases). Used to penalize wrong-variation listings
 * (e.g. Cocoa ranks #1 when the photo showed Vanilla).
 */
const VARIANT_PHRASES = ["fragrance free", "fragrance-free", "color free", "dye free"] as const;

const VARIANT_WORDS = new Set([
  "almond",
  "birthday",
  "blueberry",
  "butterscotch",
  "caramel",
  "chai",
  "cherry",
  "chocolate",
  "cinnamon",
  "citrus",
  "cocoa",
  "coffee",
  "cookie",
  "coconut",
  "hazelnut",
  "honey",
  "lavender",
  "lemon",
  "maple",
  "mocha",
  "mint",
  "orange",
  "peach",
  "peanut",
  "peppermint",
  "pumpkin",
  "raspberry",
  "spearmint",
  "strawberry",
  "vanilla",
  "unscented",
]);

/** Terms from text that look like a flavor/scent/variant (lowercase). */
export function extractVariantTermsFromText(text: string): Set<string> {
  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const phrase of VARIANT_PHRASES) {
    if (lower.includes(phrase)) {
      found.add(phrase.replace(/\s+/g, " "));
    }
  }
  for (const w of VARIANT_WORDS) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      found.add(w);
    }
  }
  return found;
}

/** When vision names a scent/flavor, drop titles that encode a different one. */
export function filterCatalogItemsVariantConsistency(
  items: CatalogItem[],
  matchHints: string[],
  searchQuery: string,
): CatalogItem[] {
  const expected = extractVariantTermsFromText(`${matchHints.join(" ")} ${searchQuery}`);
  if (expected.size === 0) return items;
  return items.filter((it) => {
    const inTitle = extractVariantTermsFromText(it.title);
    if (inTitle.size === 0) return true;
    return [...expected].some((e) => inTitle.has(e));
  });
}

/**
 * When the photo/hints specify a flavor (etc.), demote listings that show a different variant word in the title.
 */
function variantMismatchPenalty(title: string, hints: string[], searchQuery: string): number {
  const expectedBlob = `${hints.join(" ")} ${searchQuery}`.trim();
  const expected = extractVariantTermsFromText(expectedBlob);
  if (expected.size === 0) return 0;

  const inTitle = extractVariantTermsFromText(title);
  if (inTitle.size === 0) return 0;

  const overlap = [...expected].filter((e) => inTitle.has(e));
  if (overlap.length > 0) return 0;

  // Hints say e.g. vanilla; title only mentions cocoa/chocolate — wrong SKU.
  return 52;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PRODUCT_LINE_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "with",
  "for",
  "from",
  "by",
  "to",
  "of",
  "in",
  "at",
  "x",
]);

/**
 * Strip flavor/scent words and pack/size noise so titles can be compared for **same product line**
 * (vanilla vs cocoa = same line; "Daily Shampoo" vs "Super Shampoo" = different).
 */
export function normalizeProductLineKey(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/\s*[|/]\s*/g, " ");
  for (const phrase of VARIANT_PHRASES) {
    t = t.replace(new RegExp(escapeRegExp(phrase).replace(/\s+/g, "\\s+"), "gi"), " ");
  }
  for (const w of VARIANT_WORDS) {
    t = t.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi"), " ");
  }
  t = t.replace(/\bpack\s+of\s+\d+\b/gi, " ");
  t = t.replace(/\b\d+[-\s]?(pack|pk|pks|ct|count)\b/gi, " ");
  t = t.replace(/\b(twin|triple|duo)\s+pack\b/gi, " ");
  t = t.replace(/\b\d+(\.\d+)?\s*(fl\.?\s*oz|oz|ml|cl|l|lb|lbs|g|kg)\b/gi, " ");
  t = t.replace(/\b\d+(\.\d+)?\s*(ounce|ounces|gram|grams)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokenSetForProductLine(normalizedKey: string): Set<string> {
  const out = new Set<string>();
  for (const raw of normalizedKey.split(/\s+/)) {
    const w = raw.replace(/[^a-z0-9]/g, "");
    if (w.length < 2) continue;
    if (PRODUCT_LINE_STOP.has(w)) continue;
    out.add(w);
  }
  return out;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter++;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function isSameProductLineTokens(seed: Set<string>, cand: Set<string>, minJaccard: number): boolean {
  if (cand.size === 0) return false;
  let inter = 0;
  for (const x of cand) {
    if (seed.has(x)) inter++;
  }
  const j = jaccardSimilarity(seed, cand);
  if (j >= minJaccard) return true;
  const m = Math.min(seed.size, cand.size);
  const containment = m > 0 ? inter / m : 0;
  // Short titles that are almost fully contained in the seed line (typical variant listings).
  if (containment >= 0.82 && inter >= 3) return true;
  return false;
}

/**
 * True when `item` is the same merchandised product line as `seed` (size/scent/pack may differ),
 * using title tokens with variant/size/pack noise stripped. Used for barcode / UPC variation lists
 * and image-search family pools so we never return unrelated SKUs from the same manufacturer.
 */
export function catalogItemSameProductFamilyLine(
  seed: CatalogItem,
  item: CatalogItem,
  minJaccard = 0.52,
): boolean {
  const seedKey = normalizeProductLineKey(seed.title);
  const itemKey = normalizeProductLineKey(item.title);
  const seedTokens = tokenSetForProductLine(seedKey);
  const itemTokens = tokenSetForProductLine(itemKey);
  if (seedTokens.size === 0 || itemTokens.size === 0) return false;
  if (seedTokens.size < 3) {
    let inter = 0;
    for (const x of itemTokens) {
      if (seedTokens.has(x)) inter++;
    }
    const denom = Math.max(seedTokens.size, itemTokens.size);
    return denom > 0 && inter / denom >= 0.85;
  }
  return isSameProductLineTokens(seedTokens, itemTokens, minJaccard);
}

/** Catalog brand compatibility: exact, or one contains the other (handles "ibi" vs "IBI Beauty"). */
export function catalogBrandsCompatibleForFamily(brandA: string, brandB: string): boolean {
  const a = brandA.trim().toLowerCase();
  const b = brandB.trim().toLowerCase();
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

function deriveCoreFamilyFromCatalogTitle(title: string, catalogBrand: string): string {
  let t = title.trim();
  const b = catalogBrand.trim();
  if (b.length >= 2) {
    const esc = escapeRegExp(b);
    t = t.replace(new RegExp(`^${esc}\\s*[-—–:|]?\\s*`, "i"), "");
  }
  const head = (t.split(/[,|]/)[0] ?? t).trim();
  const words = head.split(/\s+/).filter(Boolean).slice(0, 12);
  return words.join(" ").trim().slice(0, 80);
}

/**
 * Synthetic vision-shaped parse when we already resolved the item from a barcode/UPC so expansion
 * never depends on LLM fields from the photo.
 */
export function buildVisionParseFromCatalogSeed(seed: CatalogItem): VisionProductFamilyParse {
  const brand = (seed.brand ?? "").trim();
  const core = deriveCoreFamilyFromCatalogTitle(seed.title, brand);
  const inferredType = detectCatalogCanonicalProductType(seed.title) ?? "";
  return {
    barcode_detected: false,
    barcode_value: "",
    brand,
    product_type: inferredType,
    product_type_confidence: inferredType ? 1 : 0,
    package_form: "",
    core_product_family: core.length >= 2 ? core : seed.title.slice(0, 72).trim(),
    product_name: seed.title.slice(0, 160),
    variant: "",
    size: "",
    count: "",
    flavor_scent_color: "",
    model_number: "",
    visible_text: [],
    confidence: 1,
  };
}

const CANONICAL_TYPES = ["lotion", "shampoo", "conditioner", "oil", "cream", "cleanser"] as const;
export type CanonicalProductType = (typeof CANONICAL_TYPES)[number];

export function normalizeVisionProductType(raw: string | undefined | null): CanonicalProductType | null {
  const x = (raw ?? "").trim().toLowerCase();
  if (!x) return null;
  if (/\b(shampoo|hair\s*wash)\b/.test(x)) return "shampoo";
  if (/\b(conditioner)\b/.test(x)) return "conditioner";
  if (/\b(cleanser|face\s*wash|wash)\b/.test(x)) return "cleanser";
  if (/\b(lotion|body\s*milk)\b/.test(x)) return "lotion";
  if (/\b(cream|butter)\b/.test(x)) return "cream";
  if (/\b(oil|serum)\b/.test(x)) return "oil";
  if ((CANONICAL_TYPES as readonly string[]).includes(x)) return x as CanonicalProductType;
  return null;
}

export function detectCatalogCanonicalProductType(title: string): CanonicalProductType | null {
  return normalizeVisionProductType(title);
}

/**
 * One stable identity string for Amazon catalog keyword search — packaging-derived fields only
 * (no visible_text keyword lists).
 */
export function buildStableAmazonIdentityQuery(parse: VisionProductFamilyParse): string {
  const famLower = parse.core_product_family.trim().toLowerCase();
  const bits: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    if (k.replace(/[^a-z0-9]/g, "").length < 2) return;
    seen.add(k);
    bits.push(s);
  };

  push(parse.brand);
  push(parse.core_product_family);
  const ptLower = parse.product_type.trim().toLowerCase();
  if (
    parse.product_type.trim() &&
    famLower &&
    !famLower.includes(ptLower) &&
    !ptLower.includes(famLower.slice(0, Math.min(12, famLower.length)))
  ) {
    push(parse.product_type.trim());
  }
  push(parse.variant);
  push(parse.flavor_scent_color);
  push(parse.size);
  push(parse.count);
  push(parse.model_number);
  return bits.join(" ").slice(0, 160);
}

/** When vision extracted a product_type, titles must also match that coarse type (stops shampoo vs lotion drift). */
export function catalogTitleMatchesAuxProductType(title: string, productType: string): boolean {
  const expected = normalizeVisionProductType(productType);
  if (!expected) return false;
  const detected = detectCatalogCanonicalProductType(title);
  if (!detected) {
    // If title doesn't clearly expose type, require expected keyword anyway.
    return title.toLowerCase().includes(expected);
  }
  return detected === expected;
}

/**
 * Keep listings that are the **same product line** as the top-ranked item: same core name, allowing
 * flavor/scent/size/pack ASINs (vanilla, cocoa, lemon, 12oz vs 24oz). Drops other products that only
 * share a brand or a few words in the title.
 */
export function filterToSameProductLine(
  ranked: CatalogItem[],
  minJaccard: number = 0.66,
): CatalogItem[] {
  if (ranked.length <= 1) return ranked;
  const seed = ranked[0]!;
  const seedKey = normalizeProductLineKey(seed.title);
  const seedTokens = tokenSetForProductLine(seedKey);
  if (seedTokens.size < 3) return ranked;

  const out: CatalogItem[] = [];
  for (const item of ranked) {
    if (!catalogBrandCompatibleWithSeed(seed, item)) continue;
    const candTokens = tokenSetForProductLine(normalizeProductLineKey(item.title));
    if (isSameProductLineTokens(seedTokens, candTokens, minJaccard)) out.push(item);
  }
  return out.length > 0 ? out : [seed];
}

function combinedImageSearchScore(
  item: CatalogItem,
  hints: string[],
  brandHint: string | null | undefined,
  searchQuery: string,
): number {
  let hintScore = scoreTitleAgainstHints(item.title, hints);
  const brandScore = brandAlignmentScore(brandHint, item);
  if (brandHint?.trim()) {
    /**
     * The product line must actually appear in the title — the catalog often returns "any SKU from
     * this brand" for keyword search, and we don't want to surface the wrong product (e.g. brand's
     * conditioner when the photo is the brand's shampoo). Bypass for very strong hint matches so
     * pack/size variants with shorter titles still slip through.
     */
    if (
      hintScore < MIN_HINT_SCORE_FOR_BRAND_BOOST &&
      queryTokenCoverage(item.title, searchQuery) < MIN_QUERY_TOKEN_COVERAGE_BRANDED
    ) {
      return 0;
    }
    if (hintScore < MIN_HINT_SCORE_FOR_BRAND_BOOST) {
      return Math.max(0, hintScore - variantMismatchPenalty(item.title, hints, searchQuery));
    }
  }
  if (brandHint?.trim() && brandScore === 0) {
    hintScore = Math.floor(hintScore * 0.35);
  }
  const raw = hintScore + brandScore;
  return Math.max(0, raw - variantMismatchPenalty(item.title, hints, searchQuery));
}

/**
 * Sort catalog hits toward listings whose titles match vision-derived hints (pack count, bundle, size, flavor).
 * When `brandHint` is set, listings that don't match that brand are demoted so category-only matches rank lower.
 * Drops zero-score rows when stronger matches exist so similar-but-wrong SKUs surface less often.
 */
export function rankCatalogItemsByImageHints(
  items: CatalogItem[],
  matchHints: string[],
  searchQuery: string,
  brandHint?: string | null,
): CatalogItem[] {
  const hints = matchHints.length > 0 ? matchHints : significantTokensFromQuery(searchQuery);
  if (hints.length === 0 && !brandHint?.trim()) return items;

  const scored = items.map((item) => ({
    item,
    score: combinedImageSearchScore(item, hints, brandHint, searchQuery),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  /**
   * If we have a brand or real hints and nothing scored above zero, the catalog rows are unrelated.
   * Returning them anyway used to surface a random SKU when the product was not actually on Amazon.
   */
  if (topScore === 0) return [];

  const positive = scored.filter((s) => s.score > 0);
  if (positive.length === 0) return [];

  /** Drop listings far below the best match (same brand, wrong product line). */
  const minKeep = Math.max(3, Math.min(topScore, topScore * 0.42));
  const withinBand = positive.filter((s) => s.score >= minKeep);
  const trimmed = withinBand.length > 0 ? withinBand : positive.slice(0, Math.min(5, positive.length));

  return trimmed.map((s) => s.item);
}

// ---------------------------------------------------------------------------
// Product-family matching (new strict scan flow)
//
// The scan flow asks the vision model for a `core_product_family` (e.g. "Hand Soap",
// "Vitamin C Gummies", "Phone Case for iPhone 15"). We then keep only catalog rows
// whose titles actually contain that family — never just rows that share a brand.
// ---------------------------------------------------------------------------

const FAMILY_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "from",
  "of",
  "to",
  "by",
  "in",
  "at",
  "on",
  "&",
  // Generic filler words vision sometimes adds to "core_product_family" — not informative.
  "product",
  "products",
  "item",
  "items",
  "set",
  "kit",
  "pack",
  "bundle",
  "new",
]);

/** Significant tokens from a family / variant string (lowercase, alphanumeric, no stopwords). */
export function familyTokens(family: string): string[] {
  if (!family) return [];
  const out: string[] = [];
  for (const raw of family.toLowerCase().split(/[\s\-_/|,]+/)) {
    const w = raw.replace(/[^a-z0-9]/g, "");
    if (w.length < 2) continue;
    if (FAMILY_STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

/**
 * True when the catalog title contains the product family from the photo.
 * - Family with 1–2 tokens: ALL must appear (so "Hand Soap" rejects "Dish Soap").
 * - Family with 3+ tokens: at least 75% must appear (allows minor wording shifts).
 */
export function catalogTitleMatchesProductFamily(title: string, family: string): boolean {
  const tokens = familyTokens(family);
  if (tokens.length === 0) return true;
  const t = title.toLowerCase();
  let hits = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hits++;
  }
  if (tokens.length <= 2) return hits === tokens.length;
  return hits >= Math.ceil(tokens.length * 0.85);
}

const MULTIPACK_REGEX =
  /\b(?:\d+\s*[-–]?\s*(?:pack|pk|pks|count|ct)\b|pack\s+of\s+\d+|set\s+of\s+\d+|(?:twin|triple|duo|quad|double)[-\s]?pack|bundle\b|multi[-\s]?pack)/i;

export function detectMultipackInTitle(title: string): boolean {
  return MULTIPACK_REGEX.test(title);
}

/** Rough "single product" pack count from text (e.g. "Pack of 6" → 6, default 1). */
function extractPackCount(text: string): number {
  if (!text) return 1;
  const m =
    text.match(/\b(\d+)\s*[-–]?\s*(?:pack|pk|pks|count|ct)\b/i) ??
    text.match(/\bpack\s+of\s+(\d+)\b/i) ??
    text.match(/\bset\s+of\s+(\d+)\b/i);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (/\b(twin|double)[-\s]?pack\b/i.test(text)) return 2;
  if (/\btriple[-\s]?pack\b/i.test(text)) return 3;
  if (/\bquad[-\s]?pack\b/i.test(text)) return 4;
  return 1;
}

/** True when at least one of the variant words from the photo (scent/size/color) appears in title. */
function variantMatchesTitle(title: string, variantBits: string[]): boolean {
  if (variantBits.length === 0) return true;
  const t = title.toLowerCase();
  for (const bit of variantBits) {
    const tokens = familyTokens(bit);
    if (tokens.length === 0) continue;
    if (tokens.every((tok) => t.includes(tok))) return true;
  }
  return false;
}

/**
 * Group + reason label for a single catalog row, given the family + variant from the photo.
 * Caller is expected to have already filtered with `catalogTitleMatchesProductFamily`.
 */
export function classifyFamilyMatch(
  item: CatalogItem,
  parse: { core_product_family: string; variant: string; size: string; count: string; flavor_scent_color: string },
): { group: "exact" | "variation" | "multipack"; reason: string } {
  const variantBits = [parse.variant, parse.size, parse.flavor_scent_color].filter(Boolean);
  const photoPack = extractPackCount(parse.count);
  const titlePack = extractPackCount(item.title);
  const titleIsMultipack = detectMultipackInTitle(item.title);

  if (titleIsMultipack && photoPack <= 1 && titlePack >= 2) {
    return {
      group: "multipack",
      reason: `same product family - multipack (${titlePack}x)`,
    };
  }

  const variantOK = variantMatchesTitle(item.title, variantBits);
  if (variantOK && (titlePack === photoPack || (photoPack <= 1 && !titleIsMultipack))) {
    return { group: "exact", reason: "same product family - exact" };
  }

  const reasonBits: string[] = [];
  if (parse.flavor_scent_color && !item.title.toLowerCase().includes(parse.flavor_scent_color.toLowerCase())) {
    reasonBits.push(`different ${parse.flavor_scent_color ? "scent/color" : "variant"}`);
  } else if (parse.size && !item.title.toLowerCase().includes(parse.size.toLowerCase())) {
    reasonBits.push("different size");
  }
  if (titlePack !== photoPack) {
    reasonBits.push(`pack ${titlePack}`);
  }
  return {
    group: "variation",
    reason: reasonBits.length > 0 ? `same product family - ${reasonBits.join(", ")}` : "same product family - variation",
  };
}

/**
 * Sort by group then by score: exact first, variations next, multipacks last.
 * Within each group, items keep the relative order they came in (already ranked).
 */
export function sortByFamilyMatchGroup<
  T extends { group: "exact" | "variation" | "multipack" | "possible_related" }
>(
  items: T[],
): T[] {
  const order: Record<"exact" | "variation" | "multipack" | "possible_related", number> = {
    exact: 0,
    variation: 1,
    multipack: 2,
    possible_related: 3,
  };
  return [...items].sort((a, b) => order[a.group] - order[b.group]);
}
