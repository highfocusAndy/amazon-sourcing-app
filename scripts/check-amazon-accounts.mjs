import { PrismaClient } from "@prisma/client";
// Prisma resolves file:./dev.db relative to schema.prisma (in /prisma)
process.env.DATABASE_URL = "file:../prisma/dev.db";
const p = new PrismaClient();
const rows = await p.amazonAccount.findMany({
  select: { userId: true, sellerId: true, spRefreshTokenEnc: true, oauthMarketplaceId: true },
});
for (const r of rows) {
  r.spRefreshTokenEnc = r.spRefreshTokenEnc ? "[SET]" : null;
}
console.log("AmazonAccount rows:", JSON.stringify(rows, null, 2));

const users = await p.user.findMany({ select: { id: true, email: true } });
console.log("Users:", JSON.stringify(users, null, 2));

await p.$disconnect();
