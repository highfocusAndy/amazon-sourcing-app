import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Prisma CLI only auto-loads `.env`. Next.js loads `.env` then `.env.local` (override).
 * Run this before PrismaClient so `npm run db:seed` targets the same DB as `next dev`.
 */
const root = process.cwd();
config({ path: resolve(root, ".env") });
if (existsSync(resolve(root, ".env.local"))) {
  config({ path: resolve(root, ".env.local"), override: true });
}
