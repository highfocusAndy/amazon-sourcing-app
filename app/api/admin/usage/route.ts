import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? new Date().toISOString().slice(0, 7);

  const rows = await prisma.userMonthlyUsage.findMany({
    where: { periodKey: period },
    orderBy: [{ used: "desc" }],
    select: {
      userId: true,
      metric: true,
      used: true,
      limit: true,
      periodKey: true,
      user: { select: { email: true, name: true } },
    },
  });

  // Group by user for easier display
  const byUser = new Map<string, { email: string; name: string | null; metrics: Record<string, { used: number; limit: number | null }> }>();
  for (const row of rows) {
    if (!byUser.has(row.userId)) {
      byUser.set(row.userId, { email: row.user.email, name: row.user.name, metrics: {} });
    }
    byUser.get(row.userId)!.metrics[row.metric] = { used: row.used, limit: row.limit ?? null };
  }

  return NextResponse.json({
    ok: true,
    period,
    users: [...byUser.entries()].map(([userId, data]) => ({ userId, ...data })),
  });
}
