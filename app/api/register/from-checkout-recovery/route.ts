import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";

import { verifyCheckoutResumeToken } from "@/lib/billing/checkoutResumeToken";
import { noSignupTrialEndsAt } from "@/lib/billing/access";
import { getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  }

  let body: { token?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as { token?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = body.token?.trim();
  const rawPassword = body.password;
  const password = (typeof rawPassword === "string" ? rawPassword : String(rawPassword ?? "")).trim();
  const name = body.name?.trim() ?? null;

  if (!token) {
    return NextResponse.json({ error: "Recovery token is required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const payload = verifyCheckoutResumeToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "This link expired or is invalid. Request a new link from Finish paid signup." },
      { status: 400 },
    );
  }

  const subscription = await stripe.subscriptions.retrieve(payload.subscriptionId);
  if (subscription.status !== "trialing" && subscription.status !== "active") {
    return NextResponse.json(
      { error: "Subscription is no longer active. Contact support or subscribe again." },
      { status: 400 },
    );
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  if (!customerId || customerId !== payload.customerId) {
    return NextResponse.json({ error: "Billing record mismatch. Start over from Get access." }, { status: 400 });
  }

  const email = payload.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email in token." }, { status: 400 });
  }

  const existingCustomer = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (existingCustomer) {
    return NextResponse.json(
      { error: "This purchase is already linked to an account. Sign in." },
      { status: 409 },
    );
  }

  const existingEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingEmail) {
    return NextResponse.json(
      { error: "An account with this email already exists. Sign in." },
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
      },
    });
  } catch (e) {
    console.error("from-checkout-recovery:", e);
    return NextResponse.json({ error: "Could not create account. Try signing in." }, { status: 500 });
  }

  try {
    await stripe.subscriptions.update(subscription.id, {
      metadata: { userId: user.id },
    });
  } catch (e) {
    console.error("from-checkout-recovery metadata:", e);
  }

  return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
}
