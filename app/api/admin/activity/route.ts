import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type FeedItem = {
  id: string;
  kind: "signup" | "promo" | "usage" | "alert";
  at: string;
  title: string;
  detail?: string | null;
};

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const [signups, promos, usagePings] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, email: true, name: true, createdAt: true },
    }),
    prisma.promoRedemption.findMany({
      orderBy: { redeemedAt: "desc" },
      take: 12,
      select: {
        id: true,
        userId: true,
        redeemedAt: true,
        promoCode: { select: { code: true } },
        user: { select: { email: true, createdAt: true } },
      },
    }),
    prisma.userMonthlyUsage.findMany({
      where: {
        metric: { in: ["analyze", "analyze_offers", "catalog_search", "keyword_search", "openai_insight", "openai_chat"] },
        used: { gt: 0 },
      },
      orderBy: { updatedAt: "desc" },
      take: 18,
      select: {
        id: true,
        updatedAt: true,
        metric: true,
        used: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  const items: FeedItem[] = [];

  /** Redemption in the same request as signup — avoid duplicate "signup + promo" feed lines */
  const SIGNUP_PROMO_MERGE_MS = 5 * 60 * 1000;
  const signupPromoCodeByUserId = new Map<string, string>();
  for (const p of promos) {
    const delta = p.redeemedAt.getTime() - p.user.createdAt.getTime();
    if (delta >= 0 && delta < SIGNUP_PROMO_MERGE_MS) {
      signupPromoCodeByUserId.set(p.userId, p.promoCode.code);
    }
  }

  for (const u of signups) {
    const viaPromo = signupPromoCodeByUserId.get(u.id);
    items.push({
      id: `signup-${u.id}-${u.createdAt.toISOString()}`,
      kind: "signup",
      at: u.createdAt.toISOString(),
      title: viaPromo ? "New signup · promo code" : "New signup",
      detail: viaPromo ? `${u.email} · ${viaPromo}${u.name ? ` · ${u.name}` : ""}` : u.name ? `${u.email} · ${u.name}` : u.email,
    });
  }

  for (const p of promos) {
    const delta = p.redeemedAt.getTime() - p.user.createdAt.getTime();
    if (delta >= 0 && delta < SIGNUP_PROMO_MERGE_MS) {
      continue;
    }
    items.push({
      id: `promo-${p.id}`,
      kind: "promo",
      at: p.redeemedAt.toISOString(),
      title: `Promo ${p.promoCode.code}`,
      detail: p.user.email,
    });
  }

  for (const row of usagePings) {
    items.push({
      id: `usage-${row.id}-${row.updatedAt.toISOString()}`,
      kind: "usage",
      at: row.updatedAt.toISOString(),
      title: `${row.metric.replace(/_/g, " ")} activity`,
      detail: `${row.user.email} · ${row.used} MTD`,
    });
  }

  /** Simple alert: Stripe not configured — ops visibility only */
  const stripeOk = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const alerts: FeedItem[] = [];
  if (!stripeOk) {
    alerts.push({
      id: "alert-stripe-env",
      kind: "alert",
      at: new Date().toISOString(),
      title: "Stripe not configured",
      detail: "STRIPE_SECRET_KEY missing — check billing env.",
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const merged = [...alerts, ...items].slice(0, 30);

  return NextResponse.json({ ok: true, items: merged });
}
