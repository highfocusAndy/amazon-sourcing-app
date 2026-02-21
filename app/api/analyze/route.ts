import { NextRequest, NextResponse } from "next/server";

import { analyzeProduct } from "@/lib/analysis";

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
      return NextResponse.json({ error: "identifier is required." }, { status: 400 });
    }

    const result = await analyzeProduct({
      identifier: body.identifier,
      wholesalePrice: Number(body.wholesalePrice ?? 0),
      brand: body.brand,
      projectedMonthlyUnits: Number(body.projectedMonthlyUnits ?? 0),
      sellerType: body.sellerType === "FBM" ? "FBM" : "FBA",
      shippingCost: Number(body.shippingCost ?? 0),
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
