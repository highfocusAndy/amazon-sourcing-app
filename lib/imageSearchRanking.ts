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

export function parseVisionProductJson(content: string): VisionProductParse | null {
  const blob = extractJsonObject(content) ?? content.trim();
  try {
    const o = JSON.parse(blob) as { query?: unknown; match_hints?: unknown; brand?: unknown; upc_ean?: unknown };
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

function scoreTitleAgainstHints(title: string, hints: string[]): number {
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

function combinedImageSearchScore(
  item: CatalogItem,
  hints: string[],
  brandHint: string | null | undefined,
): number {
  let hintScore = scoreTitleAgainstHints(item.title, hints);
  const brandScore = brandAlignmentScore(brandHint, item);
  if (brandHint?.trim() && brandScore === 0) {
    // Same category keywords (e.g. "beard oil") match many brands — demote when we have a brand to match.
    hintScore = Math.floor(hintScore * 0.35);
  }
  return hintScore + brandScore;
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
    score: combinedImageSearchScore(item, hints, brandHint),
  }));
  scored.sort((a, b) => b.score - a.score);

  const maxScore = scored[0]?.score ?? 0;
  if (maxScore === 0) return items;

  if (maxScore >= 2) {
    const filtered = scored.filter((s) => s.score > 0);
    if (filtered.length > 0) return filtered.map((s) => s.item);
  }

  return scored.map((s) => s.item);
}
