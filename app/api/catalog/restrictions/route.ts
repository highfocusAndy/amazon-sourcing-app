import { NextRequest, NextResponse } from "next/server";
import { userRestrictionsLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import {
  getListingRestrictionsCachePayload,
  listingRestrictionsCacheKey,
  setListingRestrictionsCachePayload,
} from "@/lib/spApiResponseCache";

/**
 * Returns gating/restriction status for one ASIN. Used when the user selects a product
 * (e.g. in Explorer) so the right panel can show Gated/Ungated. Requires auth.
 * Uses the signed-in user's Amazon account when linked; otherwise global env credentials.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const asin = searchParams.get("asin")?.trim();
  if (!asin || asin.length !== 10) {
    return NextResponse.json(
      { error: "Valid asin (10 chars) required." },
      { status: 400 }
    );
  }

  try {
    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userRestrictionsLimit(gate.userId)) {
      return NextResponse.json(
        { error: "Too many restriction checks. Wait a moment.", asin, gated: null },
        { status: 429 },
      );
    }
    const client = await getSpApiClientForUserOrGlobal(gate.userId);
    if (!client) {
      return NextResponse.json(
        { error: SP_API_UNAVAILABLE_USER_MESSAGE, asin, gated: null },
        { status: 503 },
      );
    }
    const cacheKey = listingRestrictionsCacheKey(client.marketplaceId, client.sellerId, asin);
    const cached = await getListingRestrictionsCachePayload(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    const restrictions = await client.fetchListingRestrictions(asin);
    const gated =
      restrictions.restricted === true || restrictions.approvalRequired === true;
    const body = {
      asin,
      gated,
      approvalRequired: restrictions.approvalRequired,
      listingRestricted: restrictions.restricted,
    };
    void setListingRestrictionsCachePayload(cacheKey, body);
    return NextResponse.json(body);
  } catch (e) {
    console.error("Restrictions check error:", e);
    return NextResponse.json(
      { error: "Could not check restrictions.", asin, gated: null },
      { status: 500 }
    );
  }
}
