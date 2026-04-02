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
      return "Link your Amazon seller account so the app can call Amazon’s APIs for this product.";
    }
    return "Data connection issue. Re-run and verify your Amazon link and API credentials.";
  }

  if (item.approvalRequired || item.listingRestricted || item.restrictedBrand) {
    return "Listing/gating risk detected. Check approvals and ungating before buying.";
  }

  if (item.netProfit === null || item.roiPercent === null || item.buyBoxPrice === null) {
    if (!ctx.sessionSignedIn) {
      return "Sign in to your account first. Then connect your Amazon seller account so we can load buy box, offers, and fees from Amazon—not because the app is incomplete, but because pricing requires your authorized Seller Central link.";
    }
    if (!ctx.amazonConnected) {
      return "Connect your Amazon seller account from the header. Until Amazon is linked, buy box, offer counts, and fee-based profit/ROI cannot be pulled from Amazon’s APIs.";
    }
    if (item.buyBoxPrice !== null && item.wholesalePrice <= 0) {
      return "Buy box data is available. Enter a wholesale cost greater than zero to calculate net profit and ROI.";
    }
    if (item.buyBoxPrice === null) {
      return "Amazon did not return buy box / full offer data for this ASIN in your marketplace (this can happen even with Seller Central linked). Check the listing on Amazon or retry later.";
    }
    return "Some profit figures are still unavailable. Verify buy box, fees, and your cost on Seller Central before deciding.";
  }

  if (item.decision === "BUY") {
    return "Strong candidate. Verify in Seller Central before sourcing.";
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
