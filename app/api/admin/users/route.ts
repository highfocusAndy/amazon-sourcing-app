import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const [users, usageMaxRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        trialEndsAt: true,
        promoAccessUntil: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        amazonAccount: { select: { amazonStoreName: true, sellerId: true, updatedAt: true } },
        promoRedemptions: {
          select: { redeemedAt: true, promoCode: { select: { code: true } } },
          orderBy: { redeemedAt: "desc" },
          take: 5,
        },
        monthlyUsage: {
          where: { periodKey: new Date().toISOString().slice(0, 7) },
          select: { metric: true, used: true, limit: true },
        },
      },
    }),
    prisma.userMonthlyUsage.groupBy({
      by: ["userId"],
      _max: { updatedAt: true },
    }),
  ]);

  const usageMaxMap = new Map(
    usageMaxRows.map((r) => [r.userId, r._max.updatedAt]).filter((e): e is [string, Date] => e[1] != null),
  );

  function lastActiveIso(u: (typeof users)[0]): string | null {
    const uMax = usageMaxMap.get(u.id)?.getTime() ?? 0;
    const az = u.amazonAccount?.updatedAt?.getTime() ?? 0;
    const t = Math.max(uMax, az);
    return t > 0 ? new Date(t).toISOString() : null;
  }

  const enriched = users.map((u) => ({
    ...u,
    lastActiveAt: lastActiveIso(u),
    monthlyUsageTotals: {
      mtd: u.monthlyUsage.reduce((s, r) => s + r.used, 0),
    },
  }));

  return NextResponse.json({ ok: true, users: enriched });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const body = (await request.json()) as {
    userId: string;
    action: "extend_access" | "revoke_access" | "set_plan";
    days?: number;
    plan?: string;
  };

  const { userId, action } = body;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (action === "extend_access") {
    const days = Number(body.days ?? 30);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: "days must be 1–3650" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { promoAccessUntil: true } });
    const base = user?.promoAccessUntil && user.promoAccessUntil > new Date() ? user.promoAccessUntil : new Date();
    const newDate = new Date(base.getTime() + days * 86_400_000);
    await prisma.user.update({ where: { id: userId }, data: { promoAccessUntil: newDate } });
    return NextResponse.json({ ok: true, promoAccessUntil: newDate });
  }

  if (action === "revoke_access") {
    await prisma.user.update({
      where: { id: userId },
      data: { promoAccessUntil: new Date(0), trialEndsAt: new Date(0) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_plan") {
    const plan = body.plan;
    if (plan !== "starter" && plan !== "pro") {
      return NextResponse.json({ error: "plan must be starter or pro" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { subscriptionPlan: plan } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
