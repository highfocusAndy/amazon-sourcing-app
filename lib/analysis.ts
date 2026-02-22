import { getServerEnv } from "@/lib/env";
import { getSpApiClient } from "@/lib/spApiClient";
import type { Decision, ProductAnalysis, ProductInput, RowColor, SellerType } from "@/lib/types";

const BAD_SALES_RANK_THRESHOLD = 100_000;
const MIN_HEALTHY_ROI_PERCENT = 10;
const ESTIMATED_REFERRAL_RATE = 0.15;
const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const DEFAULT_BATCH_CONCURRENCY = 3;

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

function normalizeSellerType(value: ProductInput["sellerType"]): SellerType {
  return value === "FBM" ? "FBM" : "FBA";
}

function addReasonUnique(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function isPermissionError(message: string): boolean {
  return /unauthorized|access to requested resource is denied|403/i.test(message);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}

function estimateReferralFee(buyBoxPrice: number): number {
  return toCurrency(buyBoxPrice * ESTIMATED_REFERRAL_RATE) ?? 0;
}

function isRestrictedBrand(brand: string, restrictedBrandSet: Set<string>): boolean {
  if (!brand) {
    return false;
  }
  return restrictedBrandSet.has(brand.trim().toUpperCase());
}

function buildBaseResult(input: ProductInput): ProductAnalysis {
  const sellerType = normalizeSellerType(input.sellerType);
  return {
    id: crypto.randomUUID(),
    inputIdentifier: input.identifier.trim(),
    asin: null,
    title: "",
    brand: normalizeBrand(input.brand ?? ""),
    sellerType,
    wholesalePrice: normalizeNumber(input.wholesalePrice),
    shippingCost: sellerType === "FBM" ? Math.max(0, normalizeNumber(input.shippingCost)) : 0,
    buyBoxPrice: null,
    salesRank: null,
    amazonIsSeller: null,
    listingRestricted: null,
    approvalRequired: null,
    ipComplaintRisk: null,
    restrictionReasonCodes: [],
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
  const reasons: string[] = [...result.reasons];

  const restricted = isRestrictedBrand(result.brand, getServerEnv().restrictedBrands);
  result.restrictedBrand = restricted;

  if (result.amazonIsSeller === true) {
    addReasonUnique(reasons, "Amazon is currently a seller on this listing.");
  } else if (result.amazonIsSeller === null) {
    addReasonUnique(reasons, "Amazon seller presence could not be determined from available pricing data.");
  }

  if (result.approvalRequired === true) {
    addReasonUnique(reasons, "This ASIN requires approval for your seller account.");
  }

  if (result.listingRestricted === true) {
    addReasonUnique(reasons, "Listing restrictions were returned for this ASIN in your account.");
  }

  if (result.ipComplaintRisk === true) {
    addReasonUnique(reasons, "Potential IP/brand complaint risk detected from restriction reasons.");
  }

  if (result.salesRank !== null && result.salesRank > BAD_SALES_RANK_THRESHOLD) {
    addReasonUnique(reasons, `Sales rank ${result.salesRank.toLocaleString()} is above 100,000.`);
  }

  if (result.netProfit !== null && result.netProfit <= 0) {
    addReasonUnique(reasons, "Net profit is non-positive after wholesale and fee costs.");
  }

  if (result.roiPercent !== null && result.roiPercent < MIN_HEALTHY_ROI_PERCENT) {
    addReasonUnique(reasons, `ROI is below ${MIN_HEALTHY_ROI_PERCENT}%.`);
  }

  if (restricted) {
    addReasonUnique(reasons, "Brand is in the restricted list.");
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
      addReasonUnique(reasons, "Projected monthly profit is greater than 2x ungating invoice cost.");
    } else if (result.projectedMonthlyProfit !== null && result.ungatingCost10Units !== null) {
      addReasonUnique(reasons, "Projected monthly profit does not exceed 2x ungating invoice cost.");
    }
  }

  let decision: Decision = "UNKNOWN";
  let rowColor: RowColor = "red";

  const forcedBad =
    result.amazonIsSeller === true ||
    result.ipComplaintRisk === true ||
    (result.salesRank !== null && result.salesRank > BAD_SALES_RANK_THRESHOLD);
  if (forcedBad) {
    decision = "BAD";
    rowColor = "red";
  } else if ((restricted || result.approvalRequired === true || result.listingRestricted === true) && result.worthUngating) {
    decision = "WORTH UNGATING";
    rowColor = "yellow";
  } else if (result.approvalRequired === true || result.listingRestricted === true) {
    decision = "LOW_MARGIN";
    rowColor = "red";
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
  const spApiClient = getSpApiClient();
  const requestedProductName = String(input.productName ?? "").trim();
  const projectedMonthlyUnits =
    normalizeNumber(input.projectedMonthlyUnits) > 0
      ? normalizeNumber(input.projectedMonthlyUnits)
      : getServerEnv().defaultProjectedMonthlyUnits;

  try {
    if (!result.inputIdentifier && !requestedProductName) {
      result.error = "Missing product reference.";
      result.reasons = ["Provide ASIN/UPC/EAN or a product name to run analysis."];
      return result;
    }

    let catalog = null;
    let catalogErrorMessage: string | null = null;

    if (result.inputIdentifier) {
      try {
        catalog = await spApiClient.resolveCatalogItem(result.inputIdentifier);
      } catch (error) {
        catalogErrorMessage = error instanceof Error ? error.message : "Catalog lookup failed.";
      }
    }

    if (!catalog) {
      const keywordSeed = requestedProductName || (!ASIN_REGEX.test(result.inputIdentifier) ? result.inputIdentifier : "");
      const keywordQueries = uniqueNonEmpty([
        keywordSeed,
        result.brand && keywordSeed ? `${result.brand} ${keywordSeed}` : "",
        result.brand && keywordSeed ? `${keywordSeed} ${result.brand}` : "",
      ]);

      for (const keywordQuery of keywordQueries) {
        try {
          // Try best-to-broadest keyword combinations.
          catalog = await spApiClient.searchCatalogByKeyword(keywordQuery);
          if (catalog) {
            result.reasons.push("Catalog match resolved from keyword search.");
            if (!result.inputIdentifier) {
              result.inputIdentifier = requestedProductName;
            }
            break;
          }
        } catch (error) {
          catalogErrorMessage = error instanceof Error ? error.message : "Catalog keyword search failed.";
        }
      }
    }

    if (!catalog && result.inputIdentifier && ASIN_REGEX.test(result.inputIdentifier) && catalogErrorMessage) {
      if (isPermissionError(catalogErrorMessage)) {
        result.asin = result.inputIdentifier.toUpperCase();
        result.reasons.push("Catalog API access denied; using input ASIN directly for pricing and fee analysis.");
      }
    }

    if (!catalog && !result.asin) {
      result.error = "No ASIN found for the provided product reference.";
      result.reasons = ["Could not resolve catalog metadata from Amazon SP-API."];
      if (catalogErrorMessage) {
        result.reasons.push(catalogErrorMessage);
      } else {
        result.reasons.push("Identifier may not map to an active listing in the configured marketplace.");
      }
      return result;
    }

    if (catalog) {
      result.asin = catalog.asin;
      result.title = catalog.title;
      result.salesRank = catalog.rank;
      if (!result.brand && catalog.brand) {
        result.brand = catalog.brand;
      }
    }

    const resolvedAsin = result.asin;
    if (!resolvedAsin) {
      result.error = "No ASIN found for the provided product reference.";
      result.reasons = ["Could not resolve catalog metadata from Amazon SP-API."];
      return result;
    }

    const [pricing, listingRestrictionsResult] = await Promise.all([
      spApiClient.fetchCompetitivePricing(resolvedAsin),
      spApiClient
        .fetchListingRestrictions(resolvedAsin)
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null,
          error: error instanceof Error ? error.message : "Listing restrictions lookup failed.",
        })),
    ]);
    result.buyBoxPrice = pricing.buyBoxPrice;
    result.amazonIsSeller = pricing.amazonIsSeller;
    const listingRestrictions = listingRestrictionsResult.data;
    if (listingRestrictions) {
      result.listingRestricted = listingRestrictions.restricted;
      result.approvalRequired = listingRestrictions.approvalRequired;
      result.ipComplaintRisk = listingRestrictions.ipComplaintRisk;
      result.restrictionReasonCodes = listingRestrictions.reasonCodes;
      if (listingRestrictions.reasonCodes.length > 0) {
        addReasonUnique(result.reasons, `Restriction codes: ${listingRestrictions.reasonCodes.join(", ")}`);
      }
      if (listingRestrictions.reasonMessages.length > 0) {
        addReasonUnique(result.reasons, listingRestrictions.reasonMessages[0]);
      }
    } else if (listingRestrictionsResult.error) {
      addReasonUnique(result.reasons, `Listing restriction check unavailable: ${listingRestrictionsResult.error}`);
    }

    if (result.buyBoxPrice !== null) {
      try {
        const feeEstimate = await spApiClient.fetchFeeEstimate(resolvedAsin, result.buyBoxPrice, result.sellerType);
        let referralFee = feeEstimate.referralFee;
        let fulfillmentFee = feeEstimate.fulfillmentFee;

        // Some SP-API responses provide only total fees without detailed fee types.
        if (feeEstimate.totalFees > 0 && referralFee <= 0 && fulfillmentFee <= 0) {
          if (result.sellerType === "FBA") {
            referralFee = estimateReferralFee(result.buyBoxPrice);
            fulfillmentFee = Math.max(0, (toCurrency(feeEstimate.totalFees - referralFee) ?? 0));
          } else {
            referralFee = feeEstimate.totalFees;
          }
          result.reasons.push("Fee breakdown unavailable; total fee estimate was used.");
        }

        if (feeEstimate.totalFees <= 0 && referralFee <= 0 && result.buyBoxPrice > 0) {
          referralFee = estimateReferralFee(result.buyBoxPrice);
          result.reasons.push("Fee estimate returned zero; applied estimated referral fee (15%).");
        }

        result.referralFee = referralFee;
        if (result.sellerType === "FBA") {
          result.fbaFee = fulfillmentFee;
          result.totalFees = feeEstimate.totalFees > 0 ? feeEstimate.totalFees : toCurrency(result.referralFee + result.fbaFee) ?? 0;
        } else {
          result.fbaFee = 0;
          result.totalFees = toCurrency(result.referralFee + result.shippingCost) ?? 0;
        }
      } catch {
        result.referralFee = estimateReferralFee(result.buyBoxPrice);
        result.reasons.push("Fee preview unavailable; using estimated referral fee (15%).");
        if (result.sellerType === "FBM") {
          result.fbaFee = 0;
          result.totalFees = toCurrency(result.referralFee + result.shippingCost) ?? 0;
        } else {
          result.fbaFee = 0;
          result.totalFees = result.referralFee;
        }
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
  if (inputs.length === 0) {
    return [];
  }

  const configuredConcurrency = Number(process.env.BATCH_ANALYZE_CONCURRENCY ?? DEFAULT_BATCH_CONCURRENCY);
  const concurrency = Math.max(1, Math.min(6, Number.isFinite(configuredConcurrency) ? configuredConcurrency : DEFAULT_BATCH_CONCURRENCY));
  const results = new Array<ProductAnalysis>(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      // Keep a modest pool to improve throughput without excessive API throttling.
      results[currentIndex] = await analyzeProduct(inputs[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker()));
  return results;
}
