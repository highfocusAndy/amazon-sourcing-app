/**
 * Higher-level sourcing signals derived from a ProductAnalysis result.
 * Functions here translate raw API data (restriction codes, offer counts, flags)
 * into actionable sourcing copy for the UI and report export.
 */

import type { ProductAnalysis } from "@/lib/types";
import {
  cautionOfferBand,
  normalizeCompetitionThresholds,
  type CompetitionThresholds,
} from "@/lib/competitionThresholds";

/**
 * Listing Restrictions sometimes return reason codes such as APPROVAL_REQUIRED while the legacy
 * boolean flag stays false (e.g. old cache, or regex edge cases). Treat explicit codes as approval.
 */
export function approvalRequiredEffective(
  product: Pick<ProductAnalysis, "approvalRequired" | "restrictionReasonCodes">,
): boolean {
  if (product.approvalRequired === true) return true;
  return product.restrictionReasonCodes.some((c) =>
    /APPROVAL_REQUIRED|APPLICATION_REQUIRED|QUALIFICATION_REQUIRED|SELLER_APPROVAL|REQUIRES?_?APPROVAL/i.test(c),
  );
}

/** True only when neither API nor reason codes indicate an approval posture. */
export function approvalEligibilityUnset(
  product: Pick<ProductAnalysis, "approvalRequired" | "restrictionReasonCodes">,
): boolean {
  return product.approvalRequired === null && !approvalRequiredEffective(product);
}

function resolveThresholds(thresholds?: CompetitionThresholds | null): CompetitionThresholds {
  return normalizeCompetitionThresholds(thresholds ?? null);
}

/** Aligns with Explor Analyzer detail panel: override cost replaces wholesale when calculating net / ROI / margin. */
export function computeEffectiveEconomics(
  product: ProductAnalysis,
  detailCostRaw: string,
): { net: number | null; roi: number | null; marginPct: number | null } {
  const trimmed = detailCostRaw.trim();
  const usesOverride = trimmed !== "" && Number.isFinite(parseFloat(trimmed));
  const buyBox = product.buyBoxPrice;
  const fees = product.totalFees;
  const costNum = usesOverride ? parseFloat(trimmed) : product.wholesalePrice;

  if (buyBox != null && fees != null && Number.isFinite(costNum)) {
    const net = Math.round((buyBox - costNum - fees) * 100) / 100;
    const roi =
      costNum > 0 ? Math.round(((buyBox - costNum - fees) / costNum) * 10000) / 100 : null;
    const marginPct = buyBox > 0 ? Math.round((net / buyBox) * 10000) / 100 : null;
    return { net, roi, marginPct };
  }

  const net = product.netProfit;
  const roi = product.roiPercent;
  const marginPct =
    buyBox != null && buyBox > 0 && net != null ? Math.round((net / buyBox) * 10000) / 100 : null;
  return { net, roi, marginPct };
}

export type SourcingRiskLevel = "low" | "caution" | "high";

export function getSourcingRiskLevel(
  product: ProductAnalysis,
  opts: { effectiveRoi: number | null },
  thresholds?: CompetitionThresholds | null,
): SourcingRiskLevel {
  const th = resolveThresholds(thresholds);
  const offerCount = product.offerCount ?? null;
  const ip = product.ipComplaintRisk === true;
  const hz = product.isHazmat === true;
  const meltable = product.meltableRisk === true;
  const saturation = offerCount != null && offerCount >= th.saturatedMinOffers;

  const partialUnknown =
    product.listingRestricted == null ||
    approvalEligibilityUnset(product) ||
    offerCount == null ||
    product.ipComplaintRisk == null;

  if (ip || hz || meltable || saturation) {
    return "high";
  }

  const roiBad = opts.effectiveRoi != null && opts.effectiveRoi < 15;
  const roiUgly = opts.effectiveRoi != null && opts.effectiveRoi < 0;
  if (roiUgly) return "high";
  if (roiBad && (product.restrictedBrand || product.privateLabelRisk === true)) return "high";

  const restrictive =
    product.listingRestricted === true ||
    approvalRequiredEffective(product) ||
    product.restrictedBrand ||
    product.privateLabelRisk === true;

  if (!restrictive && !partialUnknown && opts.effectiveRoi != null && opts.effectiveRoi >= 35 && !ip && !hz && !meltable) {
    return "low";
  }

  const offerCautionBand = cautionOfferBand(th);
  const offerCaution =
    offerCount != null &&
    offerCautionBand != null &&
    offerCount >= offerCautionBand.min &&
    offerCount < offerCautionBand.maxExclusive;

  if (partialUnknown || restrictive || offerCaution) {
    return "caution";
  }

  return "low";
}

export interface MatchConfidence {
  label: string;
  percent: number | null;
  tooltip: string;
}

export function getMatchConfidence(product: ProductAnalysis): MatchConfidence {
  const group = product.matchGroup;
  const reason = product.matchReason?.trim();

  if (group === "exact") {
    return {
      label: "Exact match",
      percent: 95,
      tooltip: reason ? `Catalog match aligned with lookup: ${reason}` : "Identifier matched closely to this ASIN/catalog row.",
    };
  }

  if (group === "variation") {
    return {
      label: "Variation / family match",
      percent: 78,
      tooltip: reason
        ? `Same product family but a different variation: ${reason}`
        : "Catalog indicates a sibling variation (color, scent, size, etc.). Verify packaging before sourcing.",
    };
  }

  if (group === "multipack") {
    return {
      label: "Multipack / qty mismatch risk",
      percent: 55,
      tooltip: reason ?? "Count/unit may differ from the searched item — confirm SKU and pack quantity.",
    };
  }

  if (group === "possible_related") {
    return {
      label: "Possible related listing",
      percent: 40,
      tooltip: reason ?? "Looser catalog association — manually verify barcode, pack size, and model.",
    };
  }

  if (reason) {
    return {
      label: "Catalog match",
      percent: null,
      tooltip: reason,
    };
  }

  return {
    label: "Listing view",
    percent: null,
    tooltip:
      product.asin != null
        ? "Insights reference this ASIN from catalog or browsing. Scanner-specific match metadata is unavailable."
        : "Match metadata unavailable until an ASIN is resolved.",
  };
}

export interface OpportunitySummary {
  headline: string;
  tone: "positive" | "warn" | "neutral";
  bullets: string[];
}

function pushUnique(arr: string[], line: string) {
  if (line && !arr.includes(line)) arr.push(line);
}

export function buildOpportunitySummary(
  product: ProductAnalysis,
  opts: {
    effectiveRoi: number | null;
    effectiveNet: number | null;
  },
  thresholds?: CompetitionThresholds | null,
): OpportunitySummary {
  const th = resolveThresholds(thresholds);
  const bullets: string[] = [];
  const offerCount = product.offerCount;
  const fba = product.fbaOfferCount;
  const fbm = product.fbmOfferCount;

  if (product.ipComplaintRisk === true) {
    pushUnique(bullets, "IP / complaint-style restriction signals present");
  } else if (product.ipComplaintRisk === false) {
    pushUnique(bullets, "No IP complaint pattern in loaded restriction text");
  }

  if (offerCount != null) {
    if (offerCount <= th.lowMaxOffers) pushUnique(bullets, "Low seller count on structured offer data");
    else if (offerCount >= th.saturatedMinOffers) pushUnique(bullets, "High seller saturation on offer data");
  }

  if (fba === 0 && fbm != null && fbm > 0) {
    pushUnique(bullets, "FBM-heavy listing — audit FBA economics if inbound");
  } else if ((fba ?? 0) > 0 && (fbm ?? 0) === 0) {
    pushUnique(bullets, "FBA-only sellers in parsed breakdown");
  }

  if (product.isHazmat === true) {
    pushUnique(bullets, "Hazmat / dangerous goods flagged");
  } else if (product.isHazmat === false) {
    pushUnique(bullets, "No hazmat classification on loaded catalog signals");
  }

  if (product.meltableRisk === true) {
    pushUnique(bullets, "Meltable risk — seasonal FBA limits possible");
  }

  if (
    product.hasCatalogVariationFamily === true ||
    product.matchGroup === "variation" ||
    product.restrictionReasonCodes.some((c) => /VARIATION|PARENT_CHILD/i.test(c))
  ) {
    pushUnique(bullets, "Variation family — isolate the exact child ASIN when ordering");
  }

  if (opts.effectiveRoi != null) {
    if (opts.effectiveRoi >= 35) pushUnique(bullets, `Strong ROI (${opts.effectiveRoi.toFixed(0)}%) vs your cost`);
    else if (opts.effectiveRoi < 15) pushUnique(bullets, `Thin ROI (${opts.effectiveRoi.toFixed(0)}%) at current assumptions`);
  } else if (product.buyBoxPrice == null) {
    pushUnique(bullets, "Buy box unavailable — rerun with Amazon linked");
  }

  if (opts.effectiveNet != null && opts.effectiveNet <= 0) {
    pushUnique(bullets, "No profit at current buy box and cost");
  }

  if (bullets.length > 6) bullets.length = 6;

  const highStress = product.ipComplaintRisk === true || product.isHazmat === true;

  const roiWeak = opts.effectiveRoi != null && opts.effectiveRoi < 15;
  const noProfit = opts.effectiveNet != null && opts.effectiveNet <= 0;

  let headline = "Review carefully";
  let tone: OpportunitySummary["tone"] = "neutral";

  if (highStress || roiWeak || noProfit) {
    headline = "High-risk listing";
    tone = "warn";
  } else if (!highStress && opts.effectiveRoi != null && opts.effectiveRoi >= 35) {
    headline = "Strong opportunity";
    tone = "positive";
  } else if (!highStress && opts.effectiveRoi != null && opts.effectiveRoi >= 20) {
    headline = "Favorable posture";
    tone = "neutral";
  } else if (opts.effectiveRoi == null || product.listingRestricted == null || approvalEligibilityUnset(product)) {
    headline = "Finish loading listing data";
    tone = "neutral";
  }

  if (bullets.length === 0) {
    bullets.push("Connect Amazon in settings to load buy box, offers, and restriction details.");
  }

  return { headline, tone, bullets };
}

export function buildAiInsightSentence(
  product: ProductAnalysis,
  opts: { effectiveRoi: number | null },
  thresholds?: CompetitionThresholds | null,
): string {
  const th = resolveThresholds(thresholds);
  const parts: string[] = [];
  const risk = getSourcingRiskLevel(product, { effectiveRoi: opts.effectiveRoi }, th);

  if (risk === "low") {
    parts.push("Structural risk signals look tame relative to typical wholesale screens.");
  } else if (risk === "high") {
    parts.push("Multiple risk signals fired in this snapshot—review each flag in the panel before you commit capital.");
  } else {
    parts.push("A few signals need a closer look; weigh them against the figures above.");
  }

  const oc = product.offerCount;
  if (oc != null && oc <= th.lowMaxOffers) {
    parts.push("Offer depth looks light versus many catalog niches.");
  } else if (oc != null && oc >= th.saturatedMinOffers) {
    parts.push("Crowded seller map implies repricing friction—double-check differentiated supply.");
  }

  if (opts.effectiveRoi != null) {
    if (opts.effectiveRoi >= 35) parts.push(`Modeled ROI near ${opts.effectiveRoi.toFixed(0)}% at the buy box and fees shown—double-check inbound and prep in your ops model.`);
    else if (opts.effectiveRoi < 15) parts.push(`Modeled ROI is under ~15%; tighten landed cost or confirm FBA vs FBM matches how you ship.`);
  }

  return parts.slice(0, 3).join(" ");
}

export interface CompetitionInsight {
  labels: string[];
  density: "low" | "moderate" | "high" | "unknown";
}

export function getCompetitionInsight(
  product: ProductAnalysis,
  thresholds?: CompetitionThresholds | null,
): CompetitionInsight {
  const th = resolveThresholds(thresholds);
  const labels: string[] = [];
  const oc = product.offerCount;
  const fba = product.fbaOfferCount;
  const fbm = product.fbmOfferCount;

  let density: CompetitionInsight["density"] = "unknown";
  if (oc != null) {
    if (oc <= th.lowMaxOffers) density = "low";
    else if (oc <= th.moderateMaxOffers) density = "moderate";
    else density = "high";
  }

  if (oc != null && oc <= th.lowMaxOffers) labels.push("Low competition (offer depth)");
  else if (oc != null && oc >= th.saturatedMinOffers) labels.push("Highly saturated listing");
  else if (oc != null && oc <= th.moderateMaxOffers) labels.push("Moderate competition");

  if (fba === 0 && fbm != null && fbm > 0) {
    labels.push("FBM-only mix in parsed breakdown");
    labels.push("Potential FBA wedge if inbound math works");
  }
  if (oc == null) labels.push("Offer depth unknown — pricing API omitted counts");

  return { labels: labels.slice(0, 4), density };
}

export function roiPerformanceClass(roi: number | null): string {
  if (roi == null) return "text-slate-100";
  if (roi >= 35) return "text-emerald-300";
  if (roi >= 15) return "text-amber-200";
  return "text-rose-300";
}

export function profitPerformanceClass(profit: number | null): string {
  if (profit == null) return "text-slate-100";
  if (profit > 3) return "text-emerald-300";
  if (profit > 0) return "text-amber-200";
  return "text-rose-300";
}

export function marginPerformanceClass(pct: number | null): string {
  if (pct == null) return "text-slate-100";
  if (pct >= 22) return "text-emerald-300";
  if (pct >= 10) return "text-amber-200";
  return "text-rose-300";
}
