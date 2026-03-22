import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";

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
    const session = await auth();
    const client = await getSpApiClientForUserOrGlobal(session?.user?.id);
    if (!client) {
      return NextResponse.json(
        { error: SP_API_UNAVAILABLE_USER_MESSAGE, asin, gated: null },
        { status: 503 },
      );
    }
    const restrictions = await client.fetchListingRestrictions(asin);
    const gated =
      restrictions.restricted === true || restrictions.approvalRequired === true;
    return NextResponse.json({
      asin,
      gated,
      approvalRequired: restrictions.approvalRequired,
      listingRestricted: restrictions.restricted,
    });
  } catch (e) {
    console.error("Restrictions check error:", e);
    return NextResponse.json(
      { error: "Could not check restrictions.", asin, gated: null },
      { status: 500 }
    );
  }
}
