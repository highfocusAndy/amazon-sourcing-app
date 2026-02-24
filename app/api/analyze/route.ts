import { NextRequest, NextResponse } from "next/server";

import { analyzeProduct } from "@/lib/analysis";
import type { ProductAnalysis } from "@/lib/types";

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
    approvalRequired: result.approvalRequired,
    listingRestricted: result.listingRestricted,
    ipComplaintRisk: result.ipComplaintRisk,
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

    const result = await analyzeProduct({
      identifier: body.identifier,
      wholesalePrice: Number(body.wholesalePrice ?? 0),
      brand: body.brand,
      projectedMonthlyUnits: Number(body.projectedMonthlyUnits ?? 0),
      sellerType: body.sellerType === "FBM" ? "FBM" : "FBA",
      shippingCost: Number(body.shippingCost ?? 0),
    });

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
