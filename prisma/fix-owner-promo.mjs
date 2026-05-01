// One-time fix: set allowRepeatRedemption = true for HF-OWNER promo code
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const result = await prisma.promoCode.updateMany({
    where: { code: 'HF-OWNER' },
    data: { allowRepeatRedemption: true },
  });
  console.log(`[fix-owner-promo] Updated ${result.count} promo code(s).`);
} catch (err) {
  console.error('[fix-owner-promo] Error:', err.message);
} finally {
  await prisma.$disconnect();
}
