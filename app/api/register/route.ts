import { NextResponse } from "next/server";

/**
 * Open self-service signup is disabled. New accounts are created after Stripe checkout (/get-access) or with a promo
 * code (/api/register/from-promo).
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error:
        "Open signup is disabled. Use Get access to pay or enter a promo code, then create your account there.",
      href: "/get-access",
    },
    { status: 403 },
  );
}
