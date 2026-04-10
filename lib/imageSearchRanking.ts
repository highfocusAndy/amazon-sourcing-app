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
   * Physical product format from the photo — keeps spray vs hanging tree vs vent clip separate
   * when the brand is the same (e.g. Little Trees spray vs paper trees).
   */
  product_form?: string;
  /**
   * 2–8 short phrases (packaging / physical shape only) so any category can separate same-brand
   * different product types — e.g. "spray bottle", "squeeze tube", "blister pack", "glass jar".
   */
  format_keywords?: string[];
};

/** Narrow format buckets for image-search filtering (same brand, different SKU families). */
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

/** Infer format from vision query + hints when product_form omitted (e.g. "spray" in query). */
export function inferProductFormatFromBlob(query: string, hints: string[]): ProductFormatKind | null {
  const blob = `${query} ${hints.join(" ")}`.toLowerCase();
  if (/\b(spray|spritzer|pump\s*bottle|aerosol|mist\s*bottle)\b/.test(blob)) return "spray";
  if (/\b(hanging\s+paper|paper\s+tree|hanging\s+tree|fiber\s+tree|cardboard\s+tree)\b/.test(blob))
    return "hanging_tree";
  if (/\bvent\s*clip|ventclip\b/.test(blob)) return "vent_clip";
  if (/\b(wipes?|tissue\s+pack)\b/.test(blob)) return "wipes";
  return null;
}

/**
 * Detect format from an Amazon listing title. Hanging-tree pattern checked before generic "spray"
 * so titles with both are rare edge cases.
 */
export function detectFormatFromCatalogTitle(title: string): ProductFormatKind | null {
  const t = title.toLowerCase();
  if (/\bhanging\s+paper|paper\s+tree\b/.test(t)) return "hanging_tree";
  if (/\bvent\s*clip|ventclip\b/.test(t)) return "vent_clip";
  if (/\b(wipes?\b|tissue\s+pack)\b/.test(t) && /\b(freshener|scent|odor)\b/.test(t)) return "wipes";
  if (/\bspray\b/.test(t)) return "spray";
  return null;
}

/**
 * Keep only catalog rows whose **format** matches the photographed product (spray vs hanging tree, etc.).
 * When nothing matches, returns the original list so we do not zero out results on ambiguous titles.
 */
export function filterByProductFormat(
  ranked: CatalogItem[],
  format: ProductFormatKind | null,
): CatalogItem[] {
  if (!format || ranked.length === 0) return ranked;
  const kept = ranked.filter((it) => {
    const sig = detectFormatFromCatalogTitle(it.title);
    if (sig === null) return false;
    return sig === format;
  });
  return kept.length > 0 ? kept : ranked;
}

const FORMAT_KEYWORD_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "new",
  "pack",
]);

/** Normalize vision `format_keywords` — lowercase, drop junk, cap length. */
export function sanitizeFormatKeywords(raw: unknown[] | undefined | null): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const s = x.trim().toLowerCase().replace(/\s+/g, " ");
    if (s.length < 2 || s.length > 48) continue;
    const firstTok = s.split(/\s+/)[0] ?? "";
    if (firstTok.length <= 3 && FORMAT_KEYWORD_STOP.has(firstTok)) continue;
    out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

/** Score boost: listing title contains phrases that describe the same physical product type as the photo. */
export function scoreTitleAgainstFormatKeywords(title: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const t = title.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    const x = k.trim().toLowerCase();
    if (x.length < 2) continue;
    if (!t.includes(x)) continue;
    const words = x.split(/\s+/).filter(Boolean);
    score += words.length >= 2 ? 4 : 2;
  }
  return Math.min(score, 28);
}

/** Listing matches enough format keywords (same product *type* as the photo — any category). */
export function titleMatchesFormatKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const t = title.toLowerCase();
  let hits = 0;
  for (const k of keywords) {
    const x = k.trim().toLowerCase();
    if (x.length < 2) continue;
    if (t.includes(x)) hits++;
  }
  const need = Math.max(1, Math.ceil(keywords.length * 0.55));
  return hits >= need;
}

/**
 * Keep rows whose titles reflect the photographed packaging/shape. Works for any product category.
 * Falls back to full list if nothing would remain.
 */
export function filterByFormatKeywords(ranked: CatalogItem[], keywords: string[]): CatalogItem[] {
  if (keywords.length === 0 || ranked.length === 0) return ranked;
  const kept = ranked.filter((it) => titleMatchesFormatKeywords(it.title, keywords));
  return kept.length > 0 ? kept : ranked;
}

/** When the model sets product_form but omits format_keywords, map coarse enum to searchable phrases. */
export function formatKeywordsFallbackFromEnum(form: ProductFormatKind | null): string[] {
  if (!form) return [];
  if (form === "spray") return ["spray"];
  if (form === "hanging_tree") return ["hanging paper", "paper tree"];
  if (form === "vent_clip") return ["vent clip"];
  if (form === "wipes") return ["wipe"];
  return [];
}

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
    const product_form = typeof o.product_form === "string" ? o.product_form.trim() : "";
    const format_keywords = sanitizeFormatKeywords(
      Array.isArray(o.format_keywords) ? o.format_keywords : undefined,
    );
    if (!query) return null;
    const out: VisionProductParse = { query, match_hints };
    if (brand) out.brand = brand;
    if (upcRaw.length >= 8 && upcRaw.length <= 14) out.upc_ean = upcRaw;
    if (product_form) out.product_form = product_form;
    if (format_keywords.length > 0) out.format_keywords = format_keywords;
    return out;
  } catch {
    return null;
  }
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

function isSameProductLineTokens(seed: Set<string>, cand: Set<string>, minJaccard: number): boolean {
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
  productFormatHint?: ProductFormatKind | null,
  formatKeywords?: string[] | null,
): number {
  const kwScore = scoreTitleAgainstFormatKeywords(item.title, formatKeywords ?? []);
  let hintScore = scoreTitleAgainstHints(item.title, hints);
  const brandScore = brandAlignmentScore(brandHint, item);
  if (brandHint?.trim()) {
    // Brand name appears on many listings from that manufacturer; require product-specific hints first.
    if (hintScore < MIN_HINT_SCORE_FOR_BRAND_BOOST) {
      const base = Math.max(0, hintScore - variantMismatchPenalty(item.title, hints, searchQuery));
      const fbEarly =
        productFormatHint && detectFormatFromCatalogTitle(item.title) === productFormatHint ? 14 : 0;
      return base + fbEarly + kwScore;
    }
  }
  if (brandHint?.trim() && brandScore === 0) {
    hintScore = Math.floor(hintScore * 0.35);
  }
  let formatBoost = 0;
  if (productFormatHint) {
    const sig = detectFormatFromCatalogTitle(item.title);
    if (sig === productFormatHint) formatBoost = 14;
  }
  const raw = hintScore + brandScore + formatBoost + kwScore;
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
  productFormatHint?: ProductFormatKind | null,
  formatKeywords?: string[] | null,
): CatalogItem[] {
  const hints = matchHints.length > 0 ? matchHints : significantTokensFromQuery(searchQuery);
  if (hints.length === 0 && !brandHint?.trim()) return items;

  const scored = items.map((item) => ({
    item,
    score: combinedImageSearchScore(
      item,
      hints,
      brandHint,
      searchQuery,
      productFormatHint,
      formatKeywords,
    ),
  }));
  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  if (topScore === 0) return items;

  const positive = scored.filter((s) => s.score > 0);
  if (positive.length === 0) return items;

  /** Drop listings far below the best match (same brand, wrong product line). */
  const minKeep = Math.max(3, Math.min(topScore, topScore * 0.42));
  const withinBand = positive.filter((s) => s.score >= minKeep);
  const trimmed = withinBand.length > 0 ? withinBand : positive.slice(0, Math.min(5, positive.length));

  return trimmed.map((s) => s.item);
}
