/**
 * DELETE /api/user/delete
 * Permanently deletes the authenticated user's account and all associated data.
 * Cancels any active Stripe subscription before deletion.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/billing/stripeClient";

export const runtime = "nodejs";

export async function DELETE(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Cancel active Stripe subscription so the customer isn't charged again
  if (user.stripeSubscriptionId) {
    const stripe = getStripe();
    if (stripe) {
      await stripe.subscriptions
        .cancel(user.stripeSubscriptionId)
        .catch((e) => console.error("[delete-account] stripe cancel:", e));
    }
  }

  // Cascade deletes handle related rows (AmazonAccount, PasskeyCredential, etc.)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}
