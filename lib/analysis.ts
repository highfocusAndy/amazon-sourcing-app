import { getServerEnv } from "@/lib/env";
import { fetchFeePreviewForAsin, fetchOffersForAsin, resolveCatalogItem } from "@/lib/sp-api";
import type { Decision, ProductAnalysis, ProductInput, RowColor } from "@/lib/types";

const BAD_SALES_RANK_THRESHOLD = 100_000;
const MIN_HEALTHY_ROI_PERCENT = 10;

function toCurrency(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function toPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function normalizeBrand(value: string): string {
  return value.trim();
}

function isRestrictedBrand(brand: string, restrictedBrandSet: Set<string>): boolean {
  if (!brand) {
    return false;
  }
  return restrictedBrandSet.has(brand.trim().toUpperCase());
}

function buildBaseResult(input: ProductInput): ProductAnalysis {
  return {
    id: crypto.randomUUID(),
    inputIdentifier: input.identifier.trim(),
    asin: null,
    brand: normalizeBrand(input.brand ?? ""),
    wholesalePrice: normalizeNumber(input.wholesalePrice),
    buyBoxPrice: null,
    salesRank: null,
    amazonIsSeller: false,
    referralFee: 0,
    fbaFee: 0,
    totalFees: 0,
    netProfit: null,
    roiPercent: null,
    restrictedBrand: false,
    ungatingCost10Units: null,
    breakEvenUnits: null,
    projectedMonthlyProfit: null,
    worthUngating: false,
    decision: "UNKNOWN",
    rowColor: "red",
    reasons: [],
    createdAt: new Date().toISOString(),
  };
}

function evaluateDecision(result: ProductAnalysis, projectedMonthlyUnits: number): ProductAnalysis {
  const reasons: string[] = [];

  const restricted = isRestrictedBrand(result.brand, getServerEnv().restrictedBrands);
  result.restrictedBrand = restricted;

  if (result.amazonIsSeller) {
    reasons.push("Amazon is currently a seller on this listing.");
  }

  if (result.salesRank !== null && result.salesRank > BAD_SALES_RANK_THRESHOLD) {
    reasons.push(`Sales rank ${result.salesRank.toLocaleString()} is above 100,000.`);
  }

  if (result.netProfit !== null && result.netProfit <= 0) {
    reasons.push("Net profit is non-positive after wholesale and fee costs.");
  }

  if (result.roiPercent !== null && result.roiPercent < MIN_HEALTHY_ROI_PERCENT) {
    reasons.push(`ROI is below ${MIN_HEALTHY_ROI_PERCENT}%.`);
  }

  if (restricted) {
    reasons.push("Brand is in the restricted list.");
    result.ungatingCost10Units = toCurrency(result.wholesalePrice * 10);

    if (result.netProfit !== null) {
      result.projectedMonthlyProfit = toCurrency(result.netProfit * projectedMonthlyUnits);
    }

    if (result.netProfit !== null && result.netProfit > 0 && result.ungatingCost10Units !== null) {
      result.breakEvenUnits = toPercent(result.ungatingCost10Units / result.netProfit);
    }

    if (
      result.projectedMonthlyProfit !== null &&
      result.ungatingCost10Units !== null &&
      result.projectedMonthlyProfit > result.ungatingCost10Units * 2
    ) {
      result.worthUngating = true;
      reasons.push("Projected monthly profit is greater than 2x ungating invoice cost.");
    } else {
      reasons.push("Projected monthly profit does not exceed 2x ungating invoice cost.");
    }
  }

  let decision: Decision = "UNKNOWN";
  let rowColor: RowColor = "red";

  const forcedBad = result.amazonIsSeller || (result.salesRank !== null && result.salesRank > BAD_SALES_RANK_THRESHOLD);
  if (forcedBad) {
    decision = "BAD";
    rowColor = "red";
  } else if (restricted && result.worthUngating) {
    decision = "WORTH UNGATING";
    rowColor = "yellow";
  } else if (result.netProfit === null || result.roiPercent === null) {
    decision = "UNKNOWN";
    rowColor = "red";
  } else if (result.netProfit <= 0 || result.roiPercent < MIN_HEALTHY_ROI_PERCENT || restricted) {
    decision = "LOW_MARGIN";
    rowColor = "red";
  } else {
    decision = "BUY";
    rowColor = "green";
  }

  result.reasons = reasons;
  result.decision = decision;
  result.rowColor = rowColor;
  return result;
}

export async function analyzeProduct(input: ProductInput): Promise<ProductAnalysis> {
  const result = buildBaseResult(input);
  const projectedMonthlyUnits =
    normalizeNumber(input.projectedMonthlyUnits) > 0
      ? normalizeNumber(input.projectedMonthlyUnits)
      : getServerEnv().defaultProjectedMonthlyUnits;

  try {
    if (!result.inputIdentifier) {
      result.error = "Missing ASIN/UPC identifier.";
      result.reasons = ["Provide an ASIN, UPC, or EAN to run analysis."];
      return result;
    }

    const catalog = await resolveCatalogItem(result.inputIdentifier);
    if (!catalog?.asin) {
      result.error = "No ASIN found for this identifier.";
      result.reasons = ["Could not resolve catalog metadata from Amazon SP-API."];
      return result;
    }

    result.asin = catalog.asin;
    result.salesRank = catalog.salesRank;
    if (!result.brand && catalog.brand) {
      result.brand = catalog.brand;
    }

    const offerData = await fetchOffersForAsin(catalog.asin);
    result.buyBoxPrice = offerData.buyBoxPrice;
    result.amazonIsSeller = offerData.amazonIsSeller;

    if (result.buyBoxPrice !== null) {
      try {
        const feePreview = await fetchFeePreviewForAsin(catalog.asin, result.buyBoxPrice);
        result.referralFee = feePreview.referralFee;
        result.fbaFee = feePreview.fbaFee;
        result.totalFees = feePreview.totalFees;
      } catch {
        result.reasons.push("Fee preview unavailable; fee values defaulted to 0.");
      }

      result.netProfit = toCurrency(result.buyBoxPrice - result.wholesalePrice - result.totalFees);
      result.roiPercent =
        result.wholesalePrice > 0 && result.netProfit !== null
          ? toPercent((result.netProfit / result.wholesalePrice) * 100)
          : null;
    } else {
      result.reasons.push("No Buy Box / landed price returned from SP-API offers endpoint.");
    }

    return evaluateDecision(result, projectedMonthlyUnits);
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unexpected analysis error.";
    result.reasons.push("SP-API request failed; verify credentials and marketplace configuration.");
    return result;
  }
}

export async function analyzeBatch(inputs: ProductInput[]): Promise<ProductAnalysis[]> {
  const results: ProductAnalysis[] = [];
  for (const input of inputs) {
    // Sequential processing is safer for SP-API rate limits.
    // eslint-disable-next-line no-await-in-loop
    const analyzed = await analyzeProduct(input);
    results.push(analyzed);
  }
  return results;
}
