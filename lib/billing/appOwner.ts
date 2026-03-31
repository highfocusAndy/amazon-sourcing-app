/**
 * Single “app owner” email that always passes billing / promo checks (see APP_OWNER_EMAIL in .env).
 * Optional seed creates or updates that user when APP_OWNER_PASSWORD is set.
 */

import { normalizePromoCodeInput } from "@/lib/promoCodeNormalize";

function promoCodeFromEnvRaw(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return normalizePromoCodeInput(s);
}

export function appOwnerEmailNormalized(): string | null {
  const v = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

export function isAppOwnerEmail(email: string | null | undefined): boolean {
  const owner = appOwnerEmailNormalized();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}

/** Personal invite code from APP_OWNER_PROMO_CODE (same normalization as signup input). */
export function appOwnerPromoCodeNormalized(): string | null {
  const raw = process.env.APP_OWNER_PROMO_CODE;
  if (raw == null || !String(raw).trim()) return null;
  const v = promoCodeFromEnvRaw(String(raw));
  if (!v || v.length < 4) return null;
  return v;
}

/** Days of app access when someone signs up with the owner promo (default ~100 years). */
export function appOwnerPromoGrantDays(): number {
  const n = Number(process.env.APP_OWNER_PROMO_GRANT_DAYS);
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 365_000);
  return 36_500;
}
