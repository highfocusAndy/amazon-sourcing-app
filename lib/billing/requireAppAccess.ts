import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { billingUserHasAppAccess, getBillingOverview, loadBillingUser } from "@/lib/billing/access";

export type AppAccessResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Use at the top of API routes that should require an active trial, promo, or paid subscription.
 */
export async function requireAppAccess(): Promise<AppAccessResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const billingUser = await loadBillingUser(session.user.id, session.user.email);
  if (!billingUser) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await billingUserHasAppAccess(billingUser))) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Subscription or active trial required.",
          code: "BILLING_REQUIRED",
        },
        { status: 402 },
      ),
    };
  }
  return { ok: true, userId: billingUser.id };
}

/**
 * Like requireAppAccess but additionally enforces Pro-plan bulk upload entitlement.
 * Starter, trial, and unauthenticated users are rejected with a clear 403.
 */
export async function requireProBulkAccess(): Promise<AppAccessResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const overview = await getBillingOverview(session.user.id, session.user.email);
  if (!overview.hasAccess) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Subscription or active trial required.", code: "BILLING_REQUIRED" },
        { status: 402 },
      ),
    };
  }
  if (!overview.proBulkEntitled) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Bulk upload requires a Pro plan. Upgrade to unlock batch analysis.", code: "PRO_REQUIRED" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: session.user.id };
}
