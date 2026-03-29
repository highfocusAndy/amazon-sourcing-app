import Stripe from "stripe";

let cached: Stripe | null | undefined;

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
  return process.env.STRIPE_PRICE_ID?.trim() || null;
}

export function getAppBaseUrl(): string {
  const raw = process.env.NEXTAUTH_URL?.trim() || process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
