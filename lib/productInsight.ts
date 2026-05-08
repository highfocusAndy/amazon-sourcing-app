import type { ProductAnalysis } from "@/lib/types";

export type ProductInsightContext = {
  sessionSignedIn: boolean;
  amazonConnected: boolean;
};

function isIncompletePricingBlock(item: ProductAnalysis): boolean {
  return (
    !item.error &&
    !(item.approvalRequired || item.listingRestricted || item.restrictedBrand) &&
    (item.netProfit === null || item.roiPercent === null || item.buyBoxPrice === null)
  );
}

/** True when we should nudge the user to sign in (rare on dashboard, but keeps flows consistent). */
export function showSignInCta(item: ProductAnalysis, ctx: ProductInsightContext): boolean {
  return isIncompletePricingBlock(item) && !ctx.sessionSignedIn;
}

/** True when Amazon OAuth is the missing piece for pricing/fees. */
export function showConnectAmazonCta(item: ProductAnalysis, ctx: ProductInsightContext): boolean {
  return isIncompletePricingBlock(item) && ctx.sessionSignedIn && !ctx.amazonConnected;
}

/**
 * Short “AI:” style insight (rule-based, not an LLM). Keep messaging actionable so users do not assume the app is broken.
 */
export function buildProductInsightMessage(item: ProductAnalysis, ctx: ProductInsightContext): string {
  if (item.error) {
    if (/rate limit|QuotaExceeded|wait a few minutes/i.test(item.error)) {
      return "Amazon's API limit was reached. Wait a few minutes and try again.";
    }
    if (/Connect Amazon|not configured|SP-API is not configured|OAuth/i.test(item.error)) {
      return "Link your Amazon seller account so the app can load pricing for this product.";
    }
    return "Data connection issue. Re-run analysis and confirm your Amazon account link and API credentials.";
  }

  if (item.approvalRequired || item.listingRestricted || item.restrictedBrand) {
    return "Listing/gating risk detected. Check approvals and ungating before buying.";
  }

  if (item.netProfit === null || item.roiPercent === null || item.buyBoxPrice === null) {
    if (!ctx.sessionSignedIn) {
      return "Sign in, then connect your Amazon seller account to load buy box, offers, and profit.";
    }
    if (!ctx.amazonConnected) {
      return "Connect Amazon from the header. Buy box, offer counts, and profit need your seller account linked.";
    }
    if (item.buyBoxPrice !== null && item.wholesalePrice <= 0) {
      return "Buy box data is available. Enter a wholesale cost greater than zero to calculate net profit and ROI.";
    }
    if (item.buyBoxPrice === null) {
      return "Amazon did not return buy box or full offer data for this ASIN right now—retry the analysis or confirm marketplace and ASIN.";
    }
    return "Profit and ROI need complete inputs—enter wholesale cost above and ensure Amazon returned fees for this row (refresh if needed).";
  }

  if (item.decision === "BUY") {
    return "Strong candidate at current pricing and fees.";
  }
  if (item.decision === "WORTH UNGATING") {
    return "Potentially attractive after ungating.";
  }
  if (item.decision === "LOW_MARGIN") {
    return "Margin is thin. Negotiate cost or skip.";
  }
  if (item.decision === "NO_MARGIN") {
    return "No margin or deficit. Do not source at current costs.";
  }
  return "Needs deeper review: compare offer depth, rank trend, and competition before buying.";
}
