import { createHash, randomBytes } from "crypto";

export function createPasskeyLoginSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashPasskeyLoginSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
