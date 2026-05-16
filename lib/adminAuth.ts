import crypto from "crypto";
import { compare, hash } from "bcryptjs";

export const ADMIN_AUTH_COOKIE = "admin_auth_v2";

function authSecret(): string {
  return process.env.AUTH_SECRET ?? "no-secret-configured";
}

function safeHexEqual(a: string, b: string): boolean {
  try {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Token = HMAC(userId, AUTH_SECRET). Simple and stateless. */
export function generateAdminSessionToken(userId: string): string {
  const sig = crypto.createHmac("sha256", authSecret()).update(userId).digest("hex");
  return `${userId}:${sig}`;
}

export function validateAdminSessionToken(token: string, userId: string): boolean {
  try {
    const colon = token.indexOf(":");
    if (colon < 0) return false;
    const tokenUserId = token.slice(0, colon);
    const sig = token.slice(colon + 1);
    if (tokenUserId !== userId) return false;
    const expected = crypto.createHmac("sha256", authSecret()).update(userId).digest("hex");
    return safeHexEqual(sig, expected);
  } catch {
    return false;
  }
}

/** Returns true if ADMIN_PASSWORD env var is set, OR a hash was saved via admin UI. */
export async function isAdminPasswordRequired(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD?.trim()) return true;
  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.systemConfig.findUnique({ where: { key: "admin:password_hash" } });
    return Boolean(row?.value);
  } catch {
    return false;
  }
}

/** Verifies against bcrypt hash in DB first, then plaintext env var as fallback. */
export async function checkAdminPassword(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.systemConfig.findUnique({ where: { key: "admin:password_hash" } });
    if (row?.value) return compare(candidate, row.value);
  } catch {
    // DB unavailable — fall through
  }
  const envPw = process.env.ADMIN_PASSWORD?.trim();
  if (!envPw) return false;
  return candidate === envPw;
}

/** Bcrypt-hashes the new password and persists it to SystemConfig. */
export async function hashAndStoreAdminPassword(newPassword: string): Promise<void> {
  const hashed = await hash(newPassword, 12);
  const { prisma } = await import("@/lib/db");
  await prisma.systemConfig.upsert({
    where: { key: "admin:password_hash" },
    update: { value: hashed },
    create: { key: "admin:password_hash", value: hashed },
  });
}
