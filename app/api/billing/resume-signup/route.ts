import { NextRequest, NextResponse } from "next/server";

import { signCheckoutResumeToken } from "@/lib/billing/checkoutResumeToken";
import { getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * For customers who completed Stripe Checkout but never finished /signup/complete.
 * Looks up Stripe by email and returns a short-lived token to finish password setup.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  try {
    const customers = await stripe.customers.list({ email, limit: 20 });
    for (const c of customers.data) {
      if (!c.id) continue;
      const linked = await prisma.user.findFirst({
        where: { stripeCustomerId: c.id },
        select: { id: true },
      });
      if (linked) continue;

      const subs = await stripe.subscriptions.list({
        customer: c.id,
        status: "all",
        limit: 15,
      });
      const good = subs.data.find((s) => s.status === "trialing" || s.status === "active");
      if (!good) continue;

      const resolvedEmail = (c.email?.trim().toLowerCase() || email) as string;
      const token = signCheckoutResumeToken({
        customerId: c.id,
        email: resolvedEmail,
        subscriptionId: good.id,
      });

      return NextResponse.json({ ok: true, token }, { status: 200 });
    }

    return NextResponse.json(
      {
        error:
          "No unfinished paid signup found for that email. If you already set a password, sign in. Otherwise use Get access to start again.",
      },
      { status: 404 },
    );
  } catch (e) {
    console.error("resume-signup:", e);
    return NextResponse.json({ error: "Could not look up checkout. Try again." }, { status: 500 });
  }
}
