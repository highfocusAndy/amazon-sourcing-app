import "./loadEnv";

import { createHash } from "node:crypto";

import { hash } from "bcryptjs";
import {
  appOwnerEmailNormalized,
  appOwnerPromoCodeNormalized,
  appOwnerPromoGrantDays,
} from "@/lib/billing/appOwner";
import { noSignupTrialEndsAt } from "@/lib/billing/access";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Set FULL_ENV_RESET=true when seeding to wipe ALL users and ALL promo codes, then mint fresh tester codes. Never use on production unless you intend to delete every account. */
const fullReset =
  process.env.FULL_ENV_RESET === "true" || process.env.FULL_ENV_RESET === "1";

/**
 * Set RESET_PROMOS_ONLY=true to delete every PromoCode (and redemptions via cascade) and mint a fresh batch.
 * Users and accounts are kept; existing users keep promoAccessUntil / Stripe as-is.
 */
const resetPromosOnly =
  process.env.RESET_PROMOS_ONLY === "true" || process.env.RESET_PROMOS_ONLY === "1";

/** How many single-use tester promos to create (opaque codes — not 001, 002, …). */
const TESTER_CODE_COUNT = 40;

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Stable, non-sequential codes. Bump the label when you ship a fresh batch after a full reset
 * so new codes differ from the previous set.
 */
/** Bump this string whenever you run RESET_PROMOS_ONLY / want a different HF- batch (deterministic list). */
const OPAQUE_SEED_LABEL = "hf-promo-seed-v4";

function opaqueCodes(count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let state = createHash("sha256").update(OPAQUE_SEED_LABEL).digest();
  let counter = 0;
  while (out.length < count) {
    state = createHash("sha256").update(state).update(String(counter++)).digest();
    const len = 7 + (state[0] % 5);
    let s = "HF-";
    for (let i = 0; i < len; i++) {
      s += ALNUM[state[(i + 1) % 32] % ALNUM.length];
    }
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

async function runFullReset(): Promise<void> {
  console.warn(
    "\n⚠️  FULL_ENV_RESET: removing all users (accounts, passkeys, Amazon links), passkey login tokens, all promo codes & redemptions, challenges, and API cache.\n",
  );
  await prisma.passkeyLoginToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.passkeyChallenge.deleteMany();
  await prisma.apiResponseCache.deleteMany();
  console.warn("FULL_ENV_RESET: wipe complete.\n");
}

async function main(): Promise<void> {
  if (fullReset && resetPromosOnly) {
    console.error("Use either FULL_ENV_RESET or RESET_PROMOS_ONLY, not both.");
    process.exit(1);
  }
  if (fullReset) {
    await runFullReset();
  } else if (resetPromosOnly) {
    console.warn(
      "\nRESET_PROMOS_ONLY: deleting all promo codes (redemptions cascade). User accounts are unchanged.\n",
    );
    await prisma.promoCode.deleteMany();
  }

  await prisma.promoCode.updateMany({
    where: { code: { in: ["BETA2026", "KEEPACCESS"] } },
    data: { active: false },
  });

  await prisma.promoCode.updateMany({
    where: { code: { startsWith: "HF-TST-" } },
    data: { active: false },
  });

  const codes = opaqueCodes(TESTER_CODE_COUNT);
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    await prisma.promoCode.upsert({
      where: { code },
      create: {
        code,
        grantsDays: 30,
        label: `Tester invite — single use (one person only)`,
        maxRedemptions: 1,
        allowRepeatRedemption: false,
      },
      update: {
        active: true,
        grantsDays: 30,
        maxRedemptions: 1,
        redemptionCount: 0,
        allowRepeatRedemption: false,
      },
    });
  }

  if (fullReset) {
    console.log(
      `Full reset + promos: created/refreshed ${codes.length} opaque single-use codes (redemption counts zeroed on upsert).`,
    );
  } else {
    console.log(
      `Promos: deactivated BETA2026, KEEPACCESS, and old HF-TST-* codes (if any). Created/updated ${codes.length} opaque single-use codes (existing rows get redemptionCount reset on upsert).`,
    );
  }
  console.log("Give each tester exactly ONE code (first 8 shown):");
  console.log(codes.slice(0, 8).join(", "));
  console.log("… full list: Prisma Studio → PromoCode, or scroll your terminal");
  console.log(codes.join(", "));

  const ownerPromoCode = appOwnerPromoCodeNormalized();
  if (ownerPromoCode) {
    const grantDays = appOwnerPromoGrantDays();
    await prisma.promoCode.upsert({
      where: { code: ownerPromoCode },
      create: {
        code: ownerPromoCode,
        label: "Owner invite — code never expires; long access (APP_OWNER_PROMO_CODE)",
        grantsDays: grantDays,
        maxRedemptions: null,
        expiresAt: null,
        active: true,
        allowRepeatRedemption: false,
      },
      update: {
        active: true,
        expiresAt: null,
        grantsDays: grantDays,
        maxRedemptions: null,
        allowRepeatRedemption: false,
      },
    });
    console.log(
      `\nAPP_OWNER_PROMO: upserted ${ownerPromoCode} — PromoCode.expiresAt=null (code stays valid), grantsDays=${grantDays}. Keep the code secret.\n`,
    );
  }

  const ownerEmail = appOwnerEmailNormalized();
  const ownerPassword = process.env.APP_OWNER_PASSWORD?.trim();
  const ownerName = process.env.APP_OWNER_NAME?.trim() || "App owner";
  if (ownerEmail && ownerPassword && ownerPassword.length >= 8) {
    const passwordHash = await hash(ownerPassword, 12);
    await prisma.user.upsert({
      where: { email: ownerEmail },
      create: {
        email: ownerEmail,
        passwordHash,
        name: ownerName,
        trialEndsAt: noSignupTrialEndsAt(),
        promoAccessUntil: null,
      },
      update: {
        passwordHash,
        name: ownerName,
      },
    });
    console.log(
      `\nAPP_OWNER: upserted ${ownerEmail} — billing bypass via APP_OWNER_EMAIL; password from APP_OWNER_PASSWORD (re-applied on each seed).\n`,
    );
  } else if (ownerEmail && (!ownerPassword || ownerPassword.length < 8)) {
    console.log(
      `\nAPP_OWNER_EMAIL is set (${ownerEmail}) but APP_OWNER_PASSWORD is missing or shorter than 8 chars — add a strong password and run seed to create/update that login.\n`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
