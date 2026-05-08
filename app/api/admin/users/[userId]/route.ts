import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { userId } = await ctx.params;
  if (!userId?.trim()) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      trialEndsAt: true,
      promoAccessUntil: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionPlan: true,
      amazonAccount: {
        select: {
          amazonStoreName: true,
          sellerId: true,
          oauthMarketplaceId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      promoRedemptions: {
        orderBy: { redeemedAt: "desc" },
        select: {
          id: true,
          redeemedAt: true,
          promoCode: {
            select: { code: true, label: true, grantsDays: true },
          },
        },
      },
      monthlyUsage: {
        orderBy: [{ periodKey: "desc" }, { metric: "asc" }],
        take: 200,
        select: { periodKey: true, metric: true, used: true, limit: true, updatedAt: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { monthlyUsage, ...rest } = user;

  /** Group usage by UTC month key */
  const usageByPeriod: Record<string, Record<string, { used: number; limit: number | null; updatedAt: string }>> = {};
  for (const row of monthlyUsage) {
    if (!usageByPeriod[row.periodKey]) usageByPeriod[row.periodKey] = {};
    usageByPeriod[row.periodKey][row.metric] = {
      used: row.used,
      limit: row.limit,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  return NextResponse.json({
    ok: true,
    user: {
      ...rest,
      monthlyUsageFlat: monthlyUsage.map((row) => ({
        periodKey: row.periodKey,
        metric: row.metric,
        used: row.used,
        limit: row.limit,
        updatedAt: row.updatedAt.toISOString(),
      })),
    },
    usageByPeriod,
  });
}


