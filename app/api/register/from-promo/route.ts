import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";

import { noSignupTrialEndsAt } from "@/lib/billing/access";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { code?: string; email?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as { code?: string; email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const rawPassword = body.password;
  const password = typeof rawPassword === "string" ? rawPassword : String(rawPassword ?? "");
  const name = body.name?.trim() ?? null;
  const raw = body.code?.trim();
  const code = raw ? raw.toUpperCase() : "";

  if (!email || !password || !code) {
    return NextResponse.json({ error: "Promo code, email, and password are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo || !promo.active) {
        return { ok: false as const, message: "Invalid or inactive promo code." };
      }
      if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
        return { ok: false as const, message: "This promo code has expired." };
      }
      if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
        return { ok: false as const, message: "This promo code has reached its redemption limit." };
      }

      const now = new Date();
      const promoAccessUntil = new Date(now.getTime() + promo.grantsDays * 86_400_000);

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          trialEndsAt: noSignupTrialEndsAt(),
          promoAccessUntil,
        },
      });

      await tx.promoRedemption.create({
        data: { promoCodeId: promo.id, userId: user.id },
      });
      await tx.promoCode.update({
        where: { id: promo.id },
        data: { redemptionCount: { increment: 1 } },
      });

      return { ok: true as const, email: user.email };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, email: result.email }, { status: 201 });
  } catch (e) {
    console.error("from-promo:", e);
    return NextResponse.json({ error: "Registration failed. Try again." }, { status: 500 });
  }
}
