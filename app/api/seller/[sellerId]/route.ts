/**
 * GET /api/seller/[sellerId]
 * Returns catalog items listed by a specific seller (SP-API Catalog Items v2022-04-01).
 * Requires Amazon account connected — seller data is scoped to the authenticated seller.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUser,
  hasConnectedAmazonAccount,
} from "@/lib/amazonAccount";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sellerId: string }> },
): Promise<NextResponse> {
  const { sellerId } = await params;
  if (!sellerId?.trim()) {
    return NextResponse.json({ error: "sellerId is required." }, { status: 400 });
  }

  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const hasAmazon = await hasConnectedAmazonAccount(gate.userId);
  if (!hasAmazon) {
    return NextResponse.json(
      { error: "Connect your Amazon account to view seller listings.", requiresAmazonConnection: true, items: [], nextPageToken: null },
      { status: 403 },
    );
  }

  const client = await getSpApiClientForUser(gate.userId);
  if (!client) {
    return NextResponse.json(
      { error: "Amazon SP-API is not available.", items: [], nextPageToken: null },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const pageToken = searchParams.get("pageToken")?.trim() || undefined;
  const pageSize = Math.min(20, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  try {
    const result = await client.searchCatalogBySellerPage(sellerId, pageToken, pageSize);
    return NextResponse.json({ items: result.items, nextPageToken: result.nextPageToken });
  } catch (e) {
    console.error("Seller catalog search error:", e);
    return NextResponse.json(
      { error: "Failed to load seller listings. Please try again.", items: [], nextPageToken: null },
      { status: 503 },
    );
  }
}
