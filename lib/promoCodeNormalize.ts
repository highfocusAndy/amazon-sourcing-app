const UNICODE_DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/**
 * Normalizes pasted promo input so it matches stored codes (e.g. HF-… from seed).
 * Handles commas from copied lists, unicode dashes, and stray whitespace.
 */
export function normalizePromoCodeInput(raw: string): string {
  const head = raw
    .normalize("NFKC")
    .replace(UNICODE_DASHES, "-")
    .trim()
    .split(/[,;]/)[0]
    ?.trim() ?? "";
  return head.replace(/\s+/g, "").toUpperCase();
}
