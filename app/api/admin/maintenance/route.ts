import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const guard = await requireAdminAccess();
  if (!guard.ok) return guard.response;

  const now = new Date();

  // Keep usage history for the last 12 full months so charts stay intact.
  const usageCutoff = new Date(now);
  usageCutoff.setMonth(usageCutoff.getMonth() - 12);
  const usagePeriodCutoff = `${usageCutoff.getFullYear()}-${String(usageCutoff.getMonth() + 1).padStart(2, "0")}`;

  const [
    cacheResult,
    challengeResult,
    loginTokenResult,
    resetTokenResult,
    usageResult,
  ] = await Promise.all([
    prisma.apiResponseCache.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passkeyLoginToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.userMonthlyUsage.deleteMany({ where: { periodKey: { lt: usagePeriodCutoff } } }),
  ]);

  // Reclaim freed pages from all the deletions above.
  await prisma.$executeRawUnsafe("VACUUM");

  return NextResponse.json({
    ok: true,
    deleted: {
      expiredCache: cacheResult.count,
      expiredChallenges: challengeResult.count,
      expiredLoginTokens: loginTokenResult.count,
      expiredPasswordResets: resetTokenResult.count,
      oldUsageRecords: usageResult.count,
    },
  });
}
