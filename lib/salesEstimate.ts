/**
 * BSR → estimated monthly sales (units).
 * Uses a power-law with BSR-range-specific coefficients and exponent ~0.778
 * (aligned with industry-validated formulas). Category acts as a multiplier.
 * Accuracy: approximate only; Amazon does not publish real velocity. Use for comparison, not exact planning.
 */

const BSR_EXPONENT = 0.778;

/**
 * Base monthly coefficient by BSR range (from Daily = A × BSR^B, Monthly ≈ 30×A, B ≈ -0.778).
 * Different ranges use different A to better match real velocity.
 */
function getBaseCoefficientForRank(salesRank: number): number {
  if (salesRank <= 999) return 948_684;   // 30 × 31,622.78
  if (salesRank <= 99_999) return 777_600; // 30 × 25,920
  return 279_936;                          // 30 × 9,331.2
}

/** Category display-name patterns (from PA-API) → multiplier. Higher = more velocity in that category. */
const CATEGORY_MULTIPLIERS: Array<{ pattern: RegExp; multiplier: number }> = [
  { pattern: /books/i, multiplier: 1.9 },
  { pattern: /kindle|ebook/i, multiplier: 1.5 },
  { pattern: /electronics|computers|pc/i, multiplier: 1.35 },
  { pattern: /home & kitchen|kitchen|dining/i, multiplier: 1.15 },
  { pattern: /toys|games|baby/i, multiplier: 1.1 },
  { pattern: /beauty|personal care|health/i, multiplier: 1.05 },
  { pattern: /sports|outdoors/i, multiplier: 1.0 },
  { pattern: /clothing|apparel|shoes|fashion/i, multiplier: 0.95 },
  { pattern: /grocery|food|gourmet/i, multiplier: 0.95 },
  { pattern: /pet supplies|pet/i, multiplier: 0.9 },
  { pattern: /office|stationery|school/i, multiplier: 0.85 },
  { pattern: /automotive|tools|patio|garden/i, multiplier: 0.75 },
  { pattern: /arts|crafts|sewing/i, multiplier: 0.65 },
];

const DEFAULT_CATEGORY_MULTIPLIER = 1.0;

function getCategoryMultiplier(categoryName: string | null): number {
  if (!categoryName || !categoryName.trim()) {
    return DEFAULT_CATEGORY_MULTIPLIER;
  }
  const normalized = categoryName.trim().toLowerCase();
  for (const { pattern, multiplier } of CATEGORY_MULTIPLIERS) {
    if (pattern.test(normalized)) {
      return multiplier;
    }
  }
  return DEFAULT_CATEGORY_MULTIPLIER;
}

/**
 * Estimate monthly unit sales from BSR and optional category name.
 * Uses BSR-range-specific base coefficients and category multiplier.
 */
export function estimateMonthlySalesFromBsr(
  salesRank: number,
  categoryName: string | null
): number {
  if (!Number.isFinite(salesRank) || salesRank < 1) {
    return 0;
  }
  const baseCoeff = getBaseCoefficientForRank(salesRank);
  const categoryMult = getCategoryMultiplier(categoryName);
  const estimated = (baseCoeff / Math.pow(salesRank, BSR_EXPONENT)) * categoryMult;
  return Math.max(1, Math.round(estimated));
}
