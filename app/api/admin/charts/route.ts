/**
 * GET /api/admin/charts
 * Returns time-series data for admin dashboard charts:
 * user signups per day (last 30 days), and plan subscriber breakdown.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [recentUsers, planBreakdown] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, subscriptionPlan: true, subscriptionStatus: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.groupBy({
      by: ["subscriptionPlan", "subscriptionStatus"],
      _count: { id: true },
    }),
  ]);

  // Build daily signup buckets for the last 30 days
  const buckets: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const u of recentUsers) {
    const key = u.createdAt.toISOString().slice(0, 10);
    if (key in buckets) buckets[key]++;
  }

  const signupsByDay = Object.entries(buckets).map(([date, count]) => ({ date, count }));

  // Plan breakdown for donut / bar
  const plans: Record<string, number> = { starter: 0, pro: 0, free: 0 };
  for (const row of planBreakdown) {
    const isActive =
      row.subscriptionStatus === "active" || row.subscriptionStatus === "trialing";
    if (!isActive) {
      plans.free = (plans.free ?? 0) + row._count.id;
    } else if (row.subscriptionPlan === "pro") {
      plans.pro = (plans.pro ?? 0) + row._count.id;
    } else {
      plans.starter = (plans.starter ?? 0) + row._count.id;
    }
  }

  return NextResponse.json({
    ok: true,
    signupsByDay,
    planBreakdown: [
      { name: "Free / Trial", value: plans.free, color: "#475569" },
      { name: "Starter", value: plans.starter, color: "#14b8a6" },
      { name: "Pro", value: plans.pro, color: "#8b5cf6" },
    ],
  });
}
