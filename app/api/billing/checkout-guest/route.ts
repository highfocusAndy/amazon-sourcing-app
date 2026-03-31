import { NextResponse } from "next/server";

import { defaultTrialDays, isSubscriptionsPaused, subscriptionsPausedMessage } from "@/lib/billing/access";
import { getAppBaseUrl, getStripe, getStripePriceIdForPlan, type BillingPlan } from "@/lib/billing/stripeClient";

export const runtime = "nodejs";

/**
 * Starts Stripe Checkout without a logged-in user. After payment, the customer finishes signup at /signup/complete.
 */
function parsePlan(input: unknown): BillingPlan {
  return input === "pro" ? "pro" : "starter";
}

function allowPromotionCodes(): boolean {
  const raw = process.env.ALLOW_PROMOTION_CODES?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const base = getAppBaseUrl();
  const trialDays = defaultTrialDays();
  const subscriptionData: { metadata: Record<string, string>; trial_period_days?: number } = {
    metadata: { signupFlow: "guest_checkout", subscriptionPlan: requestedPlan },
  };
  if (trialDays > 0) {
    subscriptionData.trial_period_days = trialDays;
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/signup/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/get-access?checkout=cancel`,
    metadata: { signupFlow: "guest_checkout", subscriptionPlan: requestedPlan },
    subscription_data: subscriptionData,
    allow_promotion_codes: allowPromotionCodes(),
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({ url: checkout.url });
}
