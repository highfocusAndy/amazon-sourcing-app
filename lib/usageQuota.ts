import { prisma } from "@/lib/db";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";

export type UsageMetric =
  | "analyze"
  | "analyze_offers"
  | "catalog_search"
  | "keyword_search"
  | "restrictions"
  | "openai_insight"
  | "openai_chat";

type PlanTier = "starter" | "pro" | "owner_unlimited";

export type UsageCheckResult =
  | {
      ok: true;
      metric: UsageMetric;
      periodKey: string;
      tier: PlanTier;
      used: number;
      remaining: number | null;
      limit: number | null;
    }
  | {
      ok: false;
      metric: UsageMetric;
      periodKey: string;
      tier: PlanTier;
      used: number;
      remaining: number;
      limit: number;
    };

function monthKeyUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function metricLimit(metric: UsageMetric, tier: Exclude<PlanTier, "owner_unlimited">): number {
  const key = `${tier.toUpperCase()}_${metric.toUpperCase()}_MONTHLY`;
  const envName = `USAGE_LIMIT_${key}`;
  const defaults: Record<string, number> = {
    USAGE_LIMIT_STARTER_ANALYZE_MONTHLY: 1000,
    // Bulk offers analysis is Pro-first by default; set >0 to allow some starter usage.
    USAGE_LIMIT_STARTER_ANALYZE_OFFERS_MONTHLY: 0,
    USAGE_LIMIT_STARTER_CATALOG_SEARCH_MONTHLY: 3000,
    USAGE_LIMIT_STARTER_KEYWORD_SEARCH_MONTHLY: 1200,
    USAGE_LIMIT_STARTER_RESTRICTIONS_MONTHLY: 5000,
    USAGE_LIMIT_STARTER_OPENAI_INSIGHT_MONTHLY: 400,
    USAGE_LIMIT_STARTER_OPENAI_CHAT_MONTHLY: 200,
    USAGE_LIMIT_PRO_ANALYZE_MONTHLY: 5000,
    USAGE_LIMIT_PRO_ANALYZE_OFFERS_MONTHLY: 1500,
    USAGE_LIMIT_PRO_CATALOG_SEARCH_MONTHLY: 20000,
    USAGE_LIMIT_PRO_KEYWORD_SEARCH_MONTHLY: 8000,
    USAGE_LIMIT_PRO_RESTRICTIONS_MONTHLY: 30000,
    USAGE_LIMIT_PRO_OPENAI_INSIGHT_MONTHLY: 6000,
    USAGE_LIMIT_PRO_OPENAI_CHAT_MONTHLY: 3000,
  };
  return intEnv(envName, defaults[envName] ?? 1000);
}

async function planTierForUser(
  userId: string,
): Promise<{ tier: PlanTier; subscriptionStatus: string; subscriptionPlan: string; email: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, subscriptionPlan: true, email: true, promoAccessUntil: true },
  });
  const subscriptionStatus = user?.subscriptionStatus ?? "none";
  const subscriptionPlan = user?.subscriptionPlan ?? "starter";
  const email = user?.email ?? null;
  if (isAppOwnerEmail(email)) {
    return { tier: "owner_unlimited", subscriptionStatus, subscriptionPlan, email };
  }
  // Invited promo testers should have full feature access while promo is active.
  const promoActive = Boolean(user?.promoAccessUntil && user.promoAccessUntil.getTime() > Date.now());
  if (promoActive) {
    return { tier: "pro", subscriptionStatus, subscriptionPlan, email };
  }
  const paid = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const pro = paid && subscriptionPlan === "pro";
  return { tier: pro ? "pro" : "starter", subscriptionStatus, subscriptionPlan, email };
}

export async function consumeMonthlyUsage(
  userId: string,
  metric: UsageMetric,
): Promise<UsageCheckResult> {
  const { tier } = await planTierForUser(userId);
  const periodKey = monthKeyUtc();

  if (tier === "owner_unlimited") {
    return {
      ok: true,
      metric,
      periodKey,
      tier,
      used: 0,
      remaining: null,
      limit: null,
    };
  }

  const limit = metricLimit(metric, tier);
  const key = { userId_periodKey_metric: { userId, periodKey, metric } };

  return prisma.$transaction(async (tx) => {
    const row = await tx.userMonthlyUsage.findUnique({ where: key });
    const used = row?.used ?? 0;
    if (used >= limit) {
      return {
        ok: false as const,
        metric,
        periodKey,
        tier,
        used,
        remaining: 0,
        limit,
      };
    }
    const nextUsed = used + 1;
    await tx.userMonthlyUsage.upsert({
      where: key,
      create: {
        userId,
        periodKey,
        metric,
        used: 1,
        limit,
      },
      update: {
        used: nextUsed,
        limit,
      },
    });
    return {
      ok: true as const,
      metric,
      periodKey,
      tier,
      used: nextUsed,
      remaining: Math.max(0, limit - nextUsed),
      limit,
    };
  });
}
