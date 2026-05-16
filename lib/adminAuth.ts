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

/**
 * A short hash of the raw NextAuth session cookie value.
 * Changes every time the user signs out and back in, so the admin token
 * is automatically invalidated on each new login session.
 */
export function getSessionFingerprint(rawNextAuthToken: string): string {
  return crypto
    .createHash("sha256")
    .update(rawNextAuthToken + authSecret())
    .digest("hex")
    .slice(0, 32);
}

/** Token payload: userId:expires:sessionFingerprint */
export function generateAdminSessionToken(userId: string, sessionFingerprint: string): string {
  const payload = `${userId}:${sessionFingerprint}`;
  const sig = crypto.createHmac("sha256", authSecret()).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

export function validateAdminSessionToken(
  token: string,
  userId: string,
  sessionFingerprint: string,
): boolean {
  try {
    const lastColon = token.lastIndexOf(":");
    if (lastColon < 0) return false;
    const sig = token.slice(lastColon + 1);
    const payload = token.slice(0, lastColon);
    const expected = crypto.createHmac("sha256", authSecret()).update(payload).digest("hex");
    if (!safeHexEqual(sig, expected)) return false;
    // payload = userId:sessionFingerprint
    const colonIdx = payload.indexOf(":");
    if (colonIdx < 0) return false;
    const tokenUserId = payload.slice(0, colonIdx);
    const tokenFingerprint = payload.slice(colonIdx + 1);
    if (tokenUserId !== userId) return false;
    if (tokenFingerprint !== sessionFingerprint) return false;
    return true;
  } catch {
    return false;
  }
}

/** Returns true if ADMIN_PASSWORD env var is set, OR if a password hash has been saved via admin UI. */
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

/** Read the raw NextAuth session token from the incoming request cookies. */
export function getRawNextAuthToken(
  cookieStore: Awaited<ReturnType<typeof import("next/headers")["cookies"]>>,
): string {
  return (
    cookieStore.get("authjs.session-token")?.value ??
    cookieStore.get("__Secure-authjs.session-token")?.value ??
    ""
  );
}
