/** User-tunable seller-count bands for Explorer / Analyzer copy and risk cues. */

export type CompetitionThresholds = {
  /** Offer count ≤ this counts as low competition / light depth. */
  lowMaxOffers: number;
  /** Offer count ≤ this (and > low) counts as moderate; above moderate up to saturation is elevated. */
  moderateMaxOffers: number;
  /** Offer count ≥ this counts as highly saturated and triggers strongest saturation flags. */
  saturatedMinOffers: number;
};

export const DEFAULT_COMPETITION_THRESHOLDS: CompetitionThresholds = {
  lowMaxOffers: 3,
  moderateMaxOffers: 8,
  saturatedMinOffers: 12,
};

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Coerce incoming prefs/API values into a valid strictly ordered triple. */
export function normalizeCompetitionThresholds(raw?: Partial<CompetitionThresholds> | null): CompetitionThresholds {
  const lowDefault = DEFAULT_COMPETITION_THRESHOLDS.lowMaxOffers;
  const modDefault = DEFAULT_COMPETITION_THRESHOLDS.moderateMaxOffers;
  const satDefault = DEFAULT_COMPETITION_THRESHOLDS.saturatedMinOffers;

  const low = clampInt(raw?.lowMaxOffers, 1, 98, lowDefault);
  let mod = clampInt(raw?.moderateMaxOffers, low + 1, 499, Math.max(low + 1, modDefault));
  let sat = clampInt(raw?.saturatedMinOffers, mod + 1, 500, Math.max(mod + 1, satDefault));

  if (sat <= mod) sat = mod + 1;
  if (mod <= low) mod = low + 1;
  if (sat <= mod) sat = mod + 1;

  return { lowMaxOffers: low, moderateMaxOffers: mod, saturatedMinOffers: sat };
}

/** For legacy “caution when offer count is in the middle band” behavior. */
export function cautionOfferBand(t: CompetitionThresholds): { min: number; maxExclusive: number } | null {
  const min = Math.min(t.lowMaxOffers + 2, t.saturatedMinOffers - 1);
  if (min >= t.saturatedMinOffers) return null;
  return { min, maxExclusive: t.saturatedMinOffers };
}
