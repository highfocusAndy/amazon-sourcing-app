import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAppBaseUrl, getStripe } from "@/lib/billing/stripeClient";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account on file. Subscribe first." }, { status: 400 });
  }

  const base = getAppBaseUrl();
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${base}/subscribe`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    console.error("Stripe billing portal:", e);
    return NextResponse.json(
      {
        error:
          "Billing portal is not available. In Stripe Dashboard: Settings → Billing → Customer portal, save and activate the default configuration.",
      },
      { status: 503 },
    );
  }
}
