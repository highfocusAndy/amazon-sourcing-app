import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** How many single-use tester promos to create (opaque codes — not 001, 002, …). */
const TESTER_CODE_COUNT = 40;

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Stable, non-sequential codes so re-running seed does not reshuffle invites. */
function opaqueCodes(count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let state = createHash("sha256").update("hf-promo-seed-v2").digest();
  let counter = 0;
  while (out.length < count) {
    state = createHash("sha256").update(state).update(String(counter++)).digest();
    // 7–11 random-looking chars after HF- (length varies — harder to guess neighbors)
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

async function main(): Promise<void> {
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
        allowRepeatRedemption: false,
      },
    });
  }

  console.log(
    `Promos: deactivated BETA2026, KEEPACCESS, and old HF-TST-* codes (if any). Created/updated ${codes.length} opaque single-use codes.`,
  );
  console.log("Give each tester exactly ONE code (first 8 shown):");
  console.log(codes.slice(0, 8).join(", "));
  console.log("… full list: Prisma Studio → PromoCode, or scroll your terminal");
  console.log(codes.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
