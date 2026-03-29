import { createHmac, timingSafeEqual } from "node:crypto";

export type CheckoutResumePayload = {
  customerId: string;
  email: string;
  subscriptionId: string;
  exp: number;
};

function resumeSecret(): string {
  const s = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required for checkout resume tokens in production.");
  }
  return s || "dev-checkout-resume-insecure";
}

export function signCheckoutResumeToken(
  p: Pick<CheckoutResumePayload, "customerId" | "email" | "subscriptionId">,
  ttlSec = 3600,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload: CheckoutResumePayload = {
    customerId: p.customerId,
    email: p.email.toLowerCase(),
    subscriptionId: p.subscriptionId,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", resumeSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCheckoutResumeToken(token: string): CheckoutResumePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = createHmac("sha256", resumeSecret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload: CheckoutResumePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CheckoutResumePayload;
  } catch {
    return null;
  }
  if (
    typeof payload.customerId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.subscriptionId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
