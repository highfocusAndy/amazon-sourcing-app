import { NextRequest, NextResponse } from "next/server";

import { userAnalyzeLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  hasConnectedAmazonAccount,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import type { ItemOfferRow } from "@/lib/spApiClient";
import { analyzeProduct, buildAnalysisForOffer } from "@/lib/analysis";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

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
          errorDetail: { code: "VALIDATION_ERROR", message: "identifier is required." },
        },
        { status: 400 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userAnalyzeLimit(gate.userId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many requests. Wait a minute.",
          errorDetail: { code: "RATE_LIMIT", message: "Too many requests. Wait a minute." },
        },
        { status: 429 },
      );
    }
    const usage = await consumeMonthlyUsage(gate.userId, "analyze_offers");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly offers-analysis limit reached for your plan.",
          errorDetail: {
            code: "USAGE_LIMIT",
            metric: usage.metric,
            period: usage.periodKey,
            used: usage.used,
            limit: usage.limit,
          },
          results: [],
        },
        { status: 429 },
      );
    }
    const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
    const client = await getSpApiClientForUserOrGlobal(gate.userId);
    const wholesalePrice = Number(body.wholesalePrice ?? 0);
    const projectedMonthlyUnits = Number(body.projectedMonthlyUnits ?? 1) || 1;
    const sellerType = body.sellerType === "FBM" ? "FBM" : "FBA";
    const shippingCost = Number(body.shippingCost ?? 0);

    const baseResult = await analyzeProduct(
      {
        identifier: body.identifier.trim(),
        wholesalePrice,
        brand: body.brand,
        projectedMonthlyUnits,
        sellerType,
        shippingCost,
      },
      client,
      { skipRestrictions: !hasAmazon },
    );

    if (baseResult.error || !baseResult.asin) {
      return NextResponse.json({
        ok: false,
        error: baseResult.error ?? "Could not load product.",
        results: [baseResult],
      });
    }

    if (!client) {
      return NextResponse.json(
        {
          ok: false,
          error: SP_API_UNAVAILABLE_USER_MESSAGE,
          results: [baseResult],
        },
        { status: 503 },
      );
    }

    let offersList: ItemOfferRow[];
    try {
      offersList = await client.fetchItemOffersList(baseResult.asin);
    } catch {
      return NextResponse.json({
        ok: true,
        results: [baseResult],
      });
    }

    if (offersList.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [baseResult],
      });
    }

    const results: ProductAnalysis[] = [];
    for (const offer of offersList) {
      try {
        const feeEstimate = await client.fetchFeeEstimate(baseResult.asin!, {
          listingPrice: offer.listingPrice,
          shippingAmount: offer.shippingAmount,
        }, offer.channel);
        const row = buildAnalysisForOffer(
          baseResult,
          { landedPrice: offer.landedPrice, channel: offer.channel, condition: offer.condition },
          feeEstimate,
          projectedMonthlyUnits,
        );
        results.push(row);
      } catch {
        const row = buildAnalysisForOffer(
          baseResult,
          { landedPrice: offer.landedPrice, channel: offer.channel, condition: offer.condition },
          { referralFee: 0, fulfillmentFee: 0, totalFees: 0 },
          projectedMonthlyUnits,
        );
        results.push(row);
      }
    }

    return NextResponse.json({
      ok: true,
      results,
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
