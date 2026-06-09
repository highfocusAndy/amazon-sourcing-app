import crypto from "crypto";
import { compare, hash } from "bcryptjs";

export const ADMIN_AUTH_COOKIE = "admin_auth_v2";

/** How long an admin-password verification stays valid in the JWT (and legacy cookie). */
export const ADMIN_SESSION_MS = 30 * 60 * 1000;

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
    const sig = token.slice(colon + 1);
    const expected = crypto.createHmac("sha256", authSecret()).update(userId).digest("hex");
    return safeHexEqual(sig, expected);
  } catch {
    return false;
  }
}

export function isAdminSessionValid(adminVerifiedAt: number | undefined | null): boolean {
  if (typeof adminVerifiedAt !== "number" || !Number.isFinite(adminVerifiedAt)) return false;
  return Date.now() - adminVerifiedAt < ADMIN_SESSION_MS;
}

function adminVerifiedDbKey(userId: string): string {
  return `admin:verified:${userId}`;
}

/** Persists admin-password verification in SystemConfig (survives JWT refresh / lost cookies). */
export async function markAdminVerified(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const key = adminVerifiedDbKey(userId);
  const value = String(Date.now());
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function isAdminVerifiedInDb(userId: string): Promise<boolean> {
  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.systemConfig.findUnique({ where: { key: adminVerifiedDbKey(userId) } });
    if (!row?.value) return false;
    const at = Number(row.value);
    return Number.isFinite(at) && Date.now() - at < ADMIN_SESSION_MS;
  } catch {
    return false;
  }
}

/** JWT flag, DB record (production), or legacy admin_auth_v2 cookie. */
export async function isAdminAuthenticated(
  session: { user?: { id?: string; adminVerifiedAt?: number } } | null,
): Promise<boolean> {
  if (!await isAdminPasswordRequired()) return true;
  const userId = session?.user?.id;
  if (!userId) return false;
  if (isAdminSessionValid(session?.user?.adminVerifiedAt)) return true;
  if (await isAdminVerifiedInDb(userId)) return true;
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_AUTH_COOKIE)?.value ?? "";
    if (validateAdminSessionToken(token, userId)) {
      void markAdminVerified(userId).catch(() => {});
      return true;
    }
    return false;
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
    // Fail closed: intermittent DB errors must not expose admin actions without verification.
    return true;
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
