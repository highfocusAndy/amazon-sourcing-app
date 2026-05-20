/**
 * POST /api/upload
 * Accepts a multipart .xlsx/.xls/.csv file, parses up to 200 rows,
 * and runs batch analysis via lib/analysis.ts, streaming results back as JSON.
 */

import { NextRequest, NextResponse } from "next/server";

import { userUploadLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { analyzeBatch } from "@/lib/analysis";
import { parseSourcingFile } from "@/lib/upload-parser";
import {
  CONNECT_AMAZON_FOR_SP_API_MESSAGE,
  getSpApiClientForUser,
  hasConnectedAmazonAccount,
} from "@/lib/amazonAccount";
import type { ProductInput } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 2000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!(await userUploadLimit(gate.userId))) {
      return NextResponse.json(
        { error: "Too many uploads. Wait a minute before running another batch." },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const projectedMonthlyUnits = Number(formData.get("projectedMonthlyUnits") ?? 0);
    const sellerType = formData.get("sellerType") === "FBM" ? "FBM" : "FBA";
    const shippingCost = Number(formData.get("shippingCost") ?? 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return NextResponse.json({ error: "Only .xlsx, .xls, and .csv files are accepted." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSourcingFile(buffer);

    const validRowCount = parsed.rows.length;
    const batchInput: ProductInput[] = parsed.rows.slice(0, MAX_BATCH_SIZE).map((row) => ({
      identifier: row.identifier,
      productName: row.productName,
      wholesalePrice: row.wholesalePrice,
      brand: row.brand,
      projectedMonthlyUnits,
      sellerType,
      shippingCost,
    }));

    // Bulk analysis requires a connected seller account (SP-API only).
    const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
    if (!hasAmazon) {
      return NextResponse.json(
        { error: CONNECT_AMAZON_FOR_SP_API_MESSAGE },
        { status: 403 },
      );
    }

    // Resolve once — reused across all concurrent workers instead of
    // creating a new SpApiClient (+ token refresh) for every product row.
    const client = await getSpApiClientForUser(gate.userId);
    if (!client) {
      return NextResponse.json(
        { error: CONNECT_AMAZON_FOR_SP_API_MESSAGE },
        { status: 503 },
      );
    }
    const results = await analyzeBatch(batchInput, client);
    return NextResponse.json({
      results,
      parsedRows: parsed.rowCount,
      validRows: validRowCount,
      analyzedRows: results.length,
      maxBatchSize: MAX_BATCH_SIZE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload processing error.";
    const isUserInputError = /No identifier column|No identifier or product name column|No cost column/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isUserInputError ? 400 : 500 },
    );
  }
}
