/**
 * POST /api/analyze
 * Analyze a single product by ASIN or UPC.
 * Checks rate limits and monthly quota before delegating to lib/analysis.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { userAnalyzeLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { getSpApiClientForUser, getSpApiClientForUserOrGlobal, hasConnectedAmazonAccount } from "@/lib/amazonAccount";
import { analyzeProduct, analyzeProductPublicOnly } from "@/lib/analysis";
import { isPaApiCatalogEnabled } from "@/lib/featureFlags";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

function toStructuredOutput(result: ProductAnalysis) {
  return {
    asin: result.asin,
    title: result.title,
    brand: result.brand,
    buyBoxPrice: result.buyBoxPrice,
    referralFee: result.referralFee,
    fulfillmentFee: result.sellerType === "FBA" ? result.fbaFee : result.shippingCost,
    totalFees: result.totalFees,
    netProfit: result.netProfit,
    roi: result.roiPercent,
    rank: result.salesRank,
    salesRankCategory: result.salesRankCategory,
    estimatedMonthlySales: result.estimatedMonthlySales,
    amazonSalesVolumeLabel: result.amazonSalesVolumeLabel,
    offerCount: result.offerCount,
    fbaOfferCount: result.fbaOfferCount,
    fbmOfferCount: result.fbmOfferCount,
    sellerIds: result.sellerIds,
    sellerDetails: result.sellerDetails,
    approvalRequired: result.approvalRequired,
    listingRestricted: result.listingRestricted,
    ipComplaintRisk: result.ipComplaintRisk,
    meltableRisk: result.meltableRisk,
    privateLabelRisk: result.privateLabelRisk,
    restrictionReasonCodes: result.restrictionReasonCodes,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      identifier?: string;
      wholesalePrice?: number;
      brand?: string;
      projectedMonthlyUnits?: number;
      sellerType?: "FBA" | "FBM";
      shippingCost?: number;
    };

    if (!body.identifier || !body.identifier.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "identifier is required.",
          errorDetail: {
            code: "VALIDATION_ERROR",
            message: "identifier is required.",
          },
        },
        { status: 400 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!(await userAnalyzeLimit(gate.userId))) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many analyses. Wait a minute and try again.",
          errorDetail: { code: "RATE_LIMIT", message: "Too many analyses. Wait a minute and try again." },
        },
        { status: 429 },
      );
    }
    const usage = await consumeMonthlyUsage(gate.userId, "analyze");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly analyze limit reached for your plan.",
          errorDetail: {
            code: "USAGE_LIMIT",
            metric: usage.metric,
            period: usage.periodKey,
            used: usage.used,
            limit: usage.limit,
          },
        },
        { status: 429 },
      );
    }
    const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
    const usePaApi = await isPaApiCatalogEnabled();
    const input = {
      identifier: body.identifier,
      wholesalePrice: Number(body.wholesalePrice ?? 0),
      brand: body.brand,
      projectedMonthlyUnits: Number(body.projectedMonthlyUnits ?? 0),
      sellerType: body.sellerType === "FBM" ? "FBM" : "FBA",
      shippingCost: Number(body.shippingCost ?? 0),
    } as const;

    const result = hasAmazon
      ? await analyzeProduct(input, await getSpApiClientForUser(gate.userId))
      : usePaApi
        ? await analyzeProductPublicOnly(input)
        : await analyzeProduct(input, await getSpApiClientForUserOrGlobal(gate.userId), { skipRestrictions: true });

    return NextResponse.json({
      ok: !result.error,
      result,
      data: toStructuredOutput(result),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected server error.",
        errorDetail: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unexpected server error.",
        },
      },
      { status: 500 },
    );
  }
}
