import Stripe from "stripe";

let cached: Stripe | null | undefined;
export type BillingPlan = "starter" | "pro";

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Stripe(key);
  return cached;
}

export function getStripePriceId(): string | null {
  return getStripePriceIdForPlan("starter");
}

export function getStripePriceIdForPlan(plan: BillingPlan): string | null {
  if (plan === "pro") {
    return process.env.STRIPE_PRICE_ID_PRO?.trim() || null;
  }
  return process.env.STRIPE_PRICE_ID_STARTER?.trim() || process.env.STRIPE_PRICE_ID?.trim() || null;
}

export function detectPlanFromPriceId(priceId: string | null | undefined): BillingPlan {
  const id = priceId?.trim();
  if (!id) return "starter";
  const proId = process.env.STRIPE_PRICE_ID_PRO?.trim();
  const starterId = process.env.STRIPE_PRICE_ID_STARTER?.trim() || process.env.STRIPE_PRICE_ID?.trim();
  if (proId && id === proId) return "pro";
  if (starterId && id === starterId) return "starter";
  return "starter";
}

export function getAppBaseUrl(): string {
  const raw = process.env.NEXTAUTH_URL?.trim() || process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
