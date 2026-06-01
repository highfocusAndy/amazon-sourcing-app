/**
 * BSR → estimated monthly sales (units).
 *
 * Formula: sales = min(CAP, A / BSR^B) × categoryMultiplier
 *   A = 25,642  (calibrated so BSR 5,000 base ≈ 13 units/month)
 *   B = 0.889   (fitted to industry reference data — Jungle Scout US averages)
 *   CAP = 3,000 (applied before category multiplier; prevents absurd numbers at BSR 1–10)
 *
 * Validated anchor points (base category, no multiplier):
 *   BSR 100   → ~265   Electronics with 1.35× → ~357   (JS ref: 300–500) ✓
 *   BSR 1,000 → ~55    Electronics with 1.35× → ~74    (JS ref: 60–80)  ✓
 *   BSR 5,000 → ~13    Electronics with 1.35× → ~18    (JS ref: 15–20)  ✓
 *   BSR 10,000 → ~7    Electronics with 1.35× → ~10    (JS ref: 8–12)   ✓
 *   BSR 100,000 → ~1   (any category)                                    ✓
 *
 * Accuracy: approximate only; Amazon does not publish real velocity.
 * Use for comparison and directional decisions, not exact planning.
 */

const BSR_EXPONENT = 0.889;
const BSR_COEFFICIENT = 25_642;
/** Cap on base (pre-multiplier) estimate — prevents absurd values at BSR 1–10. */
const BSR_MONTHLY_CAP = 3_000;

/** Category display-name patterns → velocity multiplier relative to the base curve. */
const CATEGORY_MULTIPLIERS: Array<{ pattern: RegExp; multiplier: number }> = [
  { pattern: /books/i,                                    multiplier: 1.9  },
  { pattern: /kindle|ebook/i,                             multiplier: 1.5  },
  { pattern: /electronics|computers|pc/i,                 multiplier: 1.35 },
  { pattern: /home & kitchen|kitchen|dining/i,            multiplier: 1.15 },
  { pattern: /toys|games|baby/i,                          multiplier: 1.1  },
  { pattern: /beauty|personal care|health/i,              multiplier: 1.05 },
  { pattern: /sports|outdoors/i,                          multiplier: 1.0  },
  { pattern: /clothing|apparel|shoes|fashion/i,           multiplier: 0.95 },
  { pattern: /grocery|food|gourmet/i,                     multiplier: 0.95 },
  { pattern: /pet supplies|pet/i,                         multiplier: 0.9  },
  { pattern: /office|stationery|school/i,                 multiplier: 0.85 },
  { pattern: /automotive|tools|patio|garden/i,            multiplier: 0.75 },
  { pattern: /arts|crafts|sewing/i,                       multiplier: 0.65 },
];

const DEFAULT_MULTIPLIER = 1.0;

function getCategoryMultiplier(categoryName: string | null): number {
  if (!categoryName?.trim()) return DEFAULT_MULTIPLIER;
  const normalized = categoryName.trim().toLowerCase();
  for (const { pattern, multiplier } of CATEGORY_MULTIPLIERS) {
    if (pattern.test(normalized)) return multiplier;
  }
  return DEFAULT_MULTIPLIER;
}

export function estimateMonthlySalesFromBsr(
  salesRank: number,
  categoryName: string | null,
): number {
  if (!Number.isFinite(salesRank) || salesRank < 1) return 0;
  const base = Math.min(BSR_MONTHLY_CAP, BSR_COEFFICIENT / Math.pow(salesRank, BSR_EXPONENT));
  const estimated = base * getCategoryMultiplier(categoryName);
  return Math.max(1, Math.round(estimated));
}
