/**
 * GET /api/admin/top-users
 * Returns the top 10 most active users this month by total API usage.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const periodKey = new Date().toISOString().slice(0, 7);

  const usage = await prisma.userMonthlyUsage.groupBy({
    by: ["userId"],
    where: { periodKey },
    _sum: { used: true },
    orderBy: { _sum: { used: "desc" } },
    take: 10,
  });

  if (usage.length === 0) {
    return NextResponse.json({ ok: true, users: [] });
  }

  const userIds = usage.map((u) => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, subscriptionPlan: true, subscriptionStatus: true },
  });

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const result = usage.map((u) => ({
    userId: u.userId,
    totalUsed: u._sum.used ?? 0,
    user: userMap[u.userId] ?? null,
  }));

  return NextResponse.json({ ok: true, users: result });
}
