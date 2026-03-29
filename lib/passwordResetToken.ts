import { createHash, randomBytes } from "crypto";

export function createPasswordResetSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function passwordResetTtlMs(): number {
  const h = Number(process.env.PASSWORD_RESET_EXPIRY_HOURS);
  return Number.isFinite(h) && h > 0 ? Math.floor(h * 3_600_000) : 3_600_000;
}
