import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { noSignupTrialEndsAt } from "@/lib/billing/access";
import { checkoutSessionEmail } from "@/lib/billing/checkoutSessionEmail";
import { detectPlanFromPriceId, getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";
import { normalizePasswordInput } from "@/lib/passwordInput";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const SESSION_MAX_AGE_MS = 86_400_000 * 2; // 48h — Stripe default session expiry is 24h

export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }

  let body: { sessionId?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as { sessionId?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const password = normalizePasswordInput(body.password);
  const name = body.name?.trim() ?? null;

  if (!sessionId) {
    return NextResponse.json({ error: "Checkout session is required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  let cs;
  try {
    cs = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });
  } catch {
    return NextResponse.json({ error: "Invalid or expired checkout session." }, { status: 400 });
  }

  if (cs.status !== "complete" || cs.mode !== "subscription") {
    return NextResponse.json({ error: "This checkout is not complete." }, { status: 400 });
  }

  const created = cs.created * 1000;
  if (Date.now() - created > SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: "This checkout session has expired. Start again from Get access." }, { status: 400 });
  }

  const subId = typeof cs.subscription === "string" ? cs.subscription : cs.subscription?.id;
  if (!subId) {
    return NextResponse.json({ error: "No subscription on this checkout." }, { status: 400 });
  }

  const subscription =
    typeof cs.subscription === "object" && cs.subscription && !("deleted" in cs.subscription)
      ? cs.subscription
      : await stripe.subscriptions.retrieve(subId);
  const subscriptionPlan = detectPlanFromPriceId(subscription.items.data[0]?.price?.id ?? null);

  if (subscription.status !== "trialing" && subscription.status !== "active") {
    return NextResponse.json(
      { error: "Subscription is not active yet. Contact support if this persists." },
      { status: 400 },
    );
  }

  const customerId =
    typeof cs.customer === "string" ? cs.customer : typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId) {
    return NextResponse.json({ error: "Missing Stripe customer." }, { status: 400 });
  }

  const email = checkoutSessionEmail(cs);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Could not read an email from checkout. Use the same browser session or contact support." },
      { status: 400 },
    );
  }

  const existingCustomer = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (existingCustomer) {
    return NextResponse.json(
      { error: "This purchase is already linked to an account. Sign in with that email." },
      { status: 409 },
    );
  }

  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    return NextResponse.json(
      { error: "An account with this email already exists. Sign in to connect billing in settings if needed." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(password, 12);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        trialEndsAt: noSignupTrialEndsAt(),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionPlan,
      },
    });
  } catch (e) {
    console.error("from-checkout create user:", e);
    return NextResponse.json({ error: "Could not create account. Try signing in if you already registered." }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(subscription.id, {
      metadata: { userId: user.id },
    });
  } catch (e) {
    console.error("from-checkout subscription metadata:", e);
  }

  return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
}
