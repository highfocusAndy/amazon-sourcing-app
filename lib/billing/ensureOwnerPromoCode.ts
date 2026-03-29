import type { Prisma } from "@prisma/client";

import { appOwnerPromoCodeNormalized, appOwnerPromoGrantDays } from "@/lib/billing/appOwner";

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
