import { NextRequest, NextResponse } from "next/server";

import { analyzeBatch } from "@/lib/analysis";
import { parseSourcingFile } from "@/lib/upload-parser";
import type { ProductInput } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 200;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectedMonthlyUnits = Number(formData.get("projectedMonthlyUnits") ?? 0);
    const sellerType = formData.get("sellerType") === "FBM" ? "FBM" : "FBA";
    const shippingCost = Number(formData.get("shippingCost") ?? 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      return NextResponse.json({ error: "Only .xlsx and .csv files are accepted." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSourcingFile(buffer);

    const batchInput: ProductInput[] = parsed.rows.slice(0, MAX_BATCH_SIZE).map((row) => ({
      identifier: row.identifier,
      wholesalePrice: row.wholesalePrice,
      brand: row.brand,
      projectedMonthlyUnits,
      sellerType,
      shippingCost,
    }));

    const results = await analyzeBatch(batchInput);
    return NextResponse.json({
      results,
      parsedRows: parsed.rowCount,
      analyzedRows: results.length,
      maxBatchSize: MAX_BATCH_SIZE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload processing error.";
    const isUserInputError = /No identifier column|No cost column/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isUserInputError ? 400 : 500 },
    );
  }
}
