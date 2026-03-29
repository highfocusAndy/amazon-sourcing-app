import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { ensureEnvOwnerPromoRow } from "@/lib/billing/ensureOwnerPromoCode";
import { prisma } from "@/lib/db";
import { normalizePromoCodeInput } from "@/lib/promoCodeNormalize";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to redeem a code." }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const code = normalizePromoCodeInput(typeof body.code === "string" ? body.code : "");
  if (!code) {
    return NextResponse.json({ error: "Promo code is required." }, { status: 400 });
  }
  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await ensureEnvOwnerPromoRow(tx, code);
      const promo = await tx.promoCode.findUnique({
        where: { code },
      });
      if (!promo || !promo.active) {
        return { ok: false as const, message: "Invalid or inactive promo code." };
      }
      if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
        return { ok: false as const, message: "This promo code has expired." };
      }
      if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
        return { ok: false as const, message: "This promo code has reached its redemption limit." };
      }

      const existing = await tx.promoRedemption.findUnique({
        where: {
          promoCodeId_userId: { promoCodeId: promo.id, userId },
        },
      });
      if (existing && !promo.allowRepeatRedemption) {
        return { ok: false as const, message: "You have already redeemed this code." };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { promoAccessUntil: true },
      });
      if (!user) {
        return { ok: false as const, message: "User not found." };
      }

      const now = new Date();
      const base =
        user.promoAccessUntil && user.promoAccessUntil.getTime() > now.getTime()
          ? user.promoAccessUntil
          : now;
      const promoAccessUntil = new Date(base.getTime() + promo.grantsDays * 86_400_000);

      if (existing && promo.allowRepeatRedemption) {
        await tx.promoRedemption.update({
          where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
          data: { redeemedAt: now },
        });
      } else {
        await tx.promoRedemption.create({
          data: {
            promoCodeId: promo.id,
            userId,
          },
        });
      }

      await tx.promoCode.update({
        where: { id: promo.id },
        data: { redemptionCount: { increment: 1 } },
      });
      await tx.user.update({
        where: { id: userId },
        data: { promoAccessUntil },
      });

      return {
        ok: true as const,
        promoAccessUntil: promoAccessUntil.toISOString(),
        grantsDays: promo.grantsDays,
        extended: Boolean(existing && promo.allowRepeatRedemption),
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      promoAccessUntil: result.promoAccessUntil,
      grantsDays: result.grantsDays,
      extended: result.extended,
    });
  } catch (e) {
    console.error("promo redeem:", e);
    return NextResponse.json({ error: "Could not redeem code. Try again." }, { status: 500 });
  }
}
