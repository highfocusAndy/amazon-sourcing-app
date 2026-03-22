import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(`amazon-sp-refresh|${secret}`).digest();
}

/** Encrypt refresh token at rest (AES-256-GCM). */
export function encryptAmazonRefreshToken(plain: string, authSecret: string): string {
  const key = deriveKey(authSecret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptAmazonRefreshToken(enc: string, authSecret: string): string | null {
  try {
    const buf = Buffer.from(enc, "base64url");
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const key = deriveKey(authSecret);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}
