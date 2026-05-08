import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";
import { tryReadSpApiConfig } from "@/lib/spApiClient";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const periodKey = new Date().toISOString().slice(0, 7);
  const now = new Date();

  const [
    totalUsers,
    payingActive,
    trialUsersRaw,
    promoUsersRaw,
    connectedAmazon,
    usageThisMonth,
    payersByPlan,
    dbPing,
    openaiConfigured,
    keepaEnv,
    railwayEnv,
    spConfigured,
    estimatedStarterUsd,
    estimatedProUsd,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { subscriptionStatus: { in: ["active", "trialing"] } },
    }),
    prisma.user.count({
      where: {
        subscriptionStatus: { notIn: ["active", "trialing"] },
        trialEndsAt: { gt: now },
      },
    }),
    prisma.user.count({
      where: {
        subscriptionStatus: { notIn: ["active", "trialing"] },
        promoAccessUntil: { gt: now },
      },
    }),
    prisma.amazonAccount.count({
      where: {
        sellerId: { not: null },
      },
    }),
    prisma.userMonthlyUsage.findMany({
      where: { periodKey },
      select: { metric: true, used: true },
    }),
    prisma.user.groupBy({
      by: ["subscriptionPlan"],
      where: { subscriptionStatus: { in: ["active", "trialing"] } },
      _count: { id: true },
    }),
    prisma.$queryRaw<unknown[]>`SELECT 1 AS ok`.then(() => true).catch(() => false),
    Promise.resolve(Boolean(process.env.OPENAI_API_KEY?.trim())),
    Promise.resolve(Boolean(process.env.KEEPA_API_KEY?.trim())),
    Promise.resolve(
      Boolean(
        process.env.RAILWAY_ENVIRONMENT?.trim() ||
          process.env.RAILWAY_PROJECT_ID?.trim() ||
          process.env.RAILWAY_STATIC_URL?.trim(),
      ),
    ),
    Promise.resolve(tryReadSpApiConfig()),
    Promise.resolve(Number(process.env.ADMIN_ESTIMATE_STARTER_USD ?? "29") || 29),
    Promise.resolve(Number(process.env.ADMIN_ESTIMATE_PRO_USD ?? "79") || 79),
  ]);

  /** Users with Stripe subscription active/trialing, OR valid trial window, OR valid promo extension. */
  const activeAccounts = await prisma.user.count({
    where: {
      OR: [
        { subscriptionStatus: { in: ["active", "trialing"] } },
        { trialEndsAt: { gt: now } },
        { promoAccessUntil: { gt: now } },
      ],
    },
  });

  const sumMetric = (...metrics: string[]) =>
    usageThisMonth.filter((u) => metrics.includes(u.metric)).reduce((s, u) => s + u.used, 0);

  const searchesMtd = sumMetric("catalog_search", "keyword_search");
  const apiCallsMtd = usageThisMonth.reduce((s, u) => s + u.used, 0);

  let starterPaying = 0;
  let proPaying = 0;
  for (const row of payersByPlan) {
    if (row.subscriptionPlan === "starter") starterPaying = row._count.id;
    else if (row.subscriptionPlan === "pro") proPaying = row._count.id;
  }

  const estimatedMonthlyRevenue = starterPaying * estimatedStarterUsd + proPaying * estimatedProUsd;

  return NextResponse.json({
    ok: true,
    periodKey,
    metrics: {
      totalUsers,
      activeAccounts,
      trialUsers: trialUsersRaw,
      promoAccessUsers: promoUsersRaw,
      payingSubscriptions: payingActive,
      starterPaying,
      proPaying,
      connectedAmazonAccounts: connectedAmazon,
      searchesMonthToDate: searchesMtd,
      apiRequestsMonthToDate: apiCallsMtd,
      estimatedMonthlyRevenueUsd: estimatedMonthlyRevenue,
      estimatesNote:
        "MRR assumes ADMIN_ESTIMATE_STARTER_USD / ADMIN_ESTIMATE_PRO_USD per paying seat (set in env).",
    },
    health: {
      database: dbPing ? "ok" : "error",
      spApiConfigured: Boolean(spConfigured),
      railwayDetected: railwayEnv,
      openaiConfigured,
      imageSearchEnabled: openaiConfigured,
      keepaConfigured: keepaEnv,
    },
    generatedAt: now.toISOString(),
  });
}
