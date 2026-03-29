import { NextResponse } from "next/server";

import { defaultTrialDays, isSubscriptionsPaused, subscriptionsPausedMessage } from "@/lib/billing/access";
import { getAppBaseUrl, getStripe, getStripePriceId } from "@/lib/billing/stripeClient";

export const runtime = "nodejs";

/**
 * Starts Stripe Checkout without a logged-in user. After payment, the customer finishes signup at /signup/complete.
 */
export async function POST(): Promise<NextResponse> {
  if (isSubscriptionsPaused()) {
    return NextResponse.json({ error: subscriptionsPausedMessage() }, { status: 403 });
  }

  const stripe = getStripe();
  const priceId = getStripePriceId();
  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Payments are not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID." },
      { status: 503 },
    );
  }

  const base = getAppBaseUrl();
  const trialDays = defaultTrialDays();
  const subscriptionData: { metadata: Record<string, string>; trial_period_days?: number } = {
    metadata: { signupFlow: "guest_checkout" },
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
    metadata: { signupFlow: "guest_checkout" },
    subscription_data: subscriptionData,
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({ url: checkout.url });
}
