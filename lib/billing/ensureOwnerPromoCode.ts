import type { Prisma } from "@prisma/client";

import { appOwnerPromoCodeNormalized, appOwnerPromoGrantDays } from "@/lib/billing/appOwner";
import { normalizePromoCodeInput } from "@/lib/promoCodeNormalize";

/**
 * If the user entered the env-configured owner promo, ensure a PromoCode row exists.
 * Production often skips `prisma db seed`; without this, APP_OWNER_PROMO_CODE would never match the DB.
 */
export async function ensureEnvOwnerPromoRow(
  tx: Prisma.TransactionClient,
  normalizedCode: string,
): Promise<void> {
  const owner = appOwnerPromoCodeNormalized();
  if (!owner || normalizedCode !== owner) return;
  const grantsDays = appOwnerPromoGrantDays();
  await tx.promoCode.upsert({
    where: { code: owner },
    create: {
      code: owner,
      label: "Owner invite (APP_OWNER_PROMO_CODE)",
      grantsDays,
      maxRedemptions: null,
      expiresAt: null,
      active: true,
      allowRepeatRedemption: false,
    },
    update: {
      active: true,
      expiresAt: null,
      grantsDays,
      maxRedemptions: null,
      allowRepeatRedemption: false,
    },
  });
}

function lazyBootstrapPromoCodes(): Set<string> {
  const raw = process.env.LAZY_BOOTSTRAP_PROMO_CODES?.trim() ?? "";
  if (!raw) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(/[,;/\n\r]+/)) {
    const c = normalizePromoCodeInput(part);
    if (c.length >= 4) set.add(c);
  }
  return set;
}

function lazyBootstrapGrantDays(): number {
  const n = Number(process.env.LAZY_BOOTSTRAP_PROMO_GRANT_DAYS);
  if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 365_000);
  return 30;
}

/**
 * Optional comma-separated list (e.g. HF-… codes from local seed). First signup creates rows in DB — use when
 * you cannot run `prisma db seed` on production. Keep the string secret; redeploy after rotating codes.
 */
async function ensureLazyBootstrapPromoRow(
  tx: Prisma.TransactionClient,
  normalizedCode: string,
): Promise<void> {
  if (!lazyBootstrapPromoCodes().has(normalizedCode)) return;
  const grantsDays = lazyBootstrapGrantDays();
  await tx.promoCode.upsert({
    where: { code: normalizedCode },
    create: {
      code: normalizedCode,
      label: "Env list (LAZY_BOOTSTRAP_PROMO_CODES)",
      grantsDays,
      maxRedemptions: null,
      expiresAt: null,
      active: true,
      allowRepeatRedemption: false,
    },
    update: {
      active: true,
      expiresAt: null,
      grantsDays,
      maxRedemptions: null,
      allowRepeatRedemption: false,
    },
  });
}

/** Owner promo + optional LAZY_BOOTSTRAP_PROMO_CODES before lookup. */
export async function ensurePromoRowsFromEnv(
  tx: Prisma.TransactionClient,
  normalizedCode: string,
): Promise<void> {
  await ensureEnvOwnerPromoRow(tx, normalizedCode);
  await ensureLazyBootstrapPromoRow(tx, normalizedCode);
}
