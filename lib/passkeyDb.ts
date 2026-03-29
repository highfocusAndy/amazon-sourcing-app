import { prisma } from "@/lib/db";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_TOKEN_TTL_MS = 120 * 1000;

export async function cleanupPasskeyTables() {
  const now = new Date();
  await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passkeyLoginToken.deleteMany({ where: { expiresAt: { lt: now } } });
}

export function challengeExpiry() {
  return new Date(Date.now() + CHALLENGE_TTL_MS);
}

export function loginTokenExpiry() {
  return new Date(Date.now() + LOGIN_TOKEN_TTL_MS);
}

export { CHALLENGE_TTL_MS, LOGIN_TOKEN_TTL_MS };
