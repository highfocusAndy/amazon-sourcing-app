import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { defaultTrialDays, isSubscriptionsPaused, subscriptionsPausedMessage } from "@/lib/billing/access";
import { getAppBaseUrl, getStripe, getStripePriceIdForPlan, type BillingPlan } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function parsePlan(input: unknown): BillingPlan {
  return input === "pro" ? "pro" : "starter";
}

function allowPromotionCodes(): boolean {
  const raw = process.env.ALLOW_PROMOTION_CODES?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isSubscriptionsPaused()) {
    return NextResponse.json({ error: subscriptionsPausedMessage() }, { status: 403 });
  }

  const stripe = getStripe();
  let requestedPlan: BillingPlan = "starter";
  try {
    const body = (await request.json()) as { plan?: unknown };
    requestedPlan = parsePlan(body?.plan);
  } catch {
    requestedPlan = "starter";
  }
  const priceId = getStripePriceIdForPlan(requestedPlan);
  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Payments are not configured. Set STRIPE_SECRET_KEY and plan price IDs." },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, stripeCustomerId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const base = getAppBaseUrl();
  const trialDays = defaultTrialDays();
  const subscriptionData: {
    metadata: { userId: string; subscriptionPlan: BillingPlan };
    trial_period_days?: number;
  } = { metadata: { userId: session.user.id, subscriptionPlan: requestedPlan } };
  if (trialDays > 0) {
    subscriptionData.trial_period_days = trialDays;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/subscribe?checkout=success`,
    cancel_url: `${base}/subscribe?checkout=cancel`,
    client_reference_id: session.user.id,
    metadata: { userId: session.user.id, subscriptionPlan: requestedPlan },
    subscription_data: subscriptionData,
    allow_promotion_codes: allowPromotionCodes(),
    ...(user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email }),
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({ url: checkout.url });
}
