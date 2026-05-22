/**
 * Per-user monthly usage tracking and plan-limit enforcement.
 * The app owner (APP_OWNER_EMAIL) always gets unlimited access.
 * All other users are metered by plan tier with hard limits per operation type.
 */

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

type PlanTier = "trial" | "starter" | "pro" | "owner_unlimited";

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
    // Free signup trial — enough to feel the product, not enough to work for free.
    USAGE_LIMIT_TRIAL_ANALYZE_MONTHLY: 10,
    USAGE_LIMIT_TRIAL_ANALYZE_OFFERS_MONTHLY: 0,
    USAGE_LIMIT_TRIAL_CATALOG_SEARCH_MONTHLY: 10,
    USAGE_LIMIT_TRIAL_KEYWORD_SEARCH_MONTHLY: 5,
    USAGE_LIMIT_TRIAL_RESTRICTIONS_MONTHLY: 30,
    USAGE_LIMIT_TRIAL_OPENAI_INSIGHT_MONTHLY: 0,
    USAGE_LIMIT_TRIAL_OPENAI_CHAT_MONTHLY: 0,
    // Starter plan
    USAGE_LIMIT_STARTER_ANALYZE_MONTHLY: 1000,
    USAGE_LIMIT_STARTER_ANALYZE_OFFERS_MONTHLY: 0,
    USAGE_LIMIT_STARTER_CATALOG_SEARCH_MONTHLY: 3000,
    USAGE_LIMIT_STARTER_KEYWORD_SEARCH_MONTHLY: 1200,
    USAGE_LIMIT_STARTER_RESTRICTIONS_MONTHLY: 5000,
    USAGE_LIMIT_STARTER_OPENAI_INSIGHT_MONTHLY: 400,
    USAGE_LIMIT_STARTER_OPENAI_CHAT_MONTHLY: 200,
    // Pro plan
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
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      email: true,
      promoAccessUntil: true,
      trialEndsAt: true,
      createdAt: true,
    },
  });
  const subscriptionStatus = user?.subscriptionStatus ?? "none";
  const subscriptionPlan = user?.subscriptionPlan ?? "starter";
  const email = user?.email ?? null;
  if (isAppOwnerEmail(email)) {
    return { tier: "owner_unlimited", subscriptionStatus, subscriptionPlan, email };
  }
  // Invited promo testers get Pro-level access for their promo window.
  const promoActive = Boolean(user?.promoAccessUntil && user.promoAccessUntil.getTime() > Date.now());
  if (promoActive) {
    return { tier: "pro", subscriptionStatus, subscriptionPlan, email };
  }
  // Stripe active/trialing subscribers
  const paid = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  if (paid) {
    return { tier: subscriptionPlan === "pro" ? "pro" : "starter", subscriptionStatus, subscriptionPlan, email };
  }
  // Free signup trial window — limited preview quota (10 analyses / 10 catalog searches).
  const trialEnd = user?.trialEndsAt
    ? user.trialEndsAt.getTime() <= 0
      ? new Date(0)
      : user.trialEndsAt
    : new Date((user?.createdAt ?? new Date(0)).getTime() + 14 * 86_400_000);
  if (Date.now() < trialEnd.getTime()) {
    return { tier: "trial", subscriptionStatus, subscriptionPlan, email };
  }
  // Trial expired, no subscription — access is blocked by requireAppAccess before this point,
  // but fall back to starter so the quota check stays non-null if somehow reached.
  return { tier: "starter", subscriptionStatus, subscriptionPlan, email };
}

export async function consumeMonthlyUsage(
  userId: string,
  metric: UsageMetric,
  count = 1,
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
    if (used + count > limit) {
      return {
        ok: false as const,
        metric,
        periodKey,
        tier,
        used,
        remaining: Math.max(0, limit - used),
        limit,
      };
    }
    const nextUsed = used + count;
    await tx.userMonthlyUsage.upsert({
      where: key,
      create: {
        userId,
        periodKey,
        metric,
        used: count,
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
