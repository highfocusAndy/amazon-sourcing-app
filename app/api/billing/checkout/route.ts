import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { defaultTrialDays, isSubscriptionsPaused, subscriptionsPausedMessage } from "@/lib/billing/access";
import { getAppBaseUrl, getStripe, getStripePriceId } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    metadata: { userId: string };
    trial_period_days?: number;
  } = { metadata: { userId: session.user.id } };
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
    metadata: { userId: session.user.id },
    subscription_data: subscriptionData,
    ...(user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email }),
  });

  if (!checkout.url) {
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }

  return NextResponse.json({ url: checkout.url });
}
