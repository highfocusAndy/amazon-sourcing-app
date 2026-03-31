import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { detectPlanFromPriceId, getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function subscriptionCustomerId(subscription: Stripe.Subscription): string | undefined {
  const c = subscription.customer;
  if (typeof c === "string" && c) return c;
  if (c && typeof c === "object" && !("deleted" in c) && "id" in c) {
    const id = (c as Stripe.Customer).id;
    return typeof id === "string" && id ? id : undefined;
  }
  return undefined;
}

function buildSubscriptionSyncPayload(
  subscription: Stripe.Subscription,
  customerId: string | undefined,
): {
  stripeCustomerId?: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  subscriptionPlan: string;
} {
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price?.id ?? null;
  const subscriptionPlan = detectPlanFromPriceId(priceId);
  const base = {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPlan,
  };
  if (customerId) {
    return { ...base, stripeCustomerId: customerId };
  }
  return base;
}

async function syncSubscriptionToUser(subscription: Stripe.Subscription): Promise<void> {
  const metaUserId = subscription.metadata?.userId?.trim();
  const customerId = subscriptionCustomerId(subscription);
  const data = buildSubscriptionSyncPayload(subscription, customerId);

  if (metaUserId) {
    const user = await prisma.user.findUnique({
      where: { id: metaUserId },
      select: { id: true },
    });
    if (user) {
      await prisma.user.update({ where: { id: metaUserId }, data });
      return;
    }
    /* metadata userId invalid or stale — fall through and try subscription id */
  }

  const bySub = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!bySub) return;

  await prisma.user.update({ where: { id: bySub.id }, data });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Stripe webhook signature:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sessionObj = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof sessionObj.subscription === "string"
            ? sessionObj.subscription
            : sessionObj.subscription?.id;
        if (!subId) break;
        /*
         * Guest checkout has no userId on the session; subscription sync runs once a User row exists
         * (matched by stripeSubscriptionId) or when subscription.metadata.userId is set after /register/from-checkout.
         * Using the Subscription object keeps customer id + status consistent with other events.
         */
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscriptionToUser(sub);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionToUser(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            stripeSubscriptionId: null,
            subscriptionStatus: "canceled",
            subscriptionPlan: "starter",
          },
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("Stripe webhook handler error:", e);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
