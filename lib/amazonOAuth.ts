/**
 * Selling Partner API — website authorization workflow (public app).
 * @see https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow
 */

import crypto from "crypto";

import { isAllowedMarketplaceId, MARKETPLACE_IDS } from "@/lib/marketplaces";

const DEFAULT_CONSENT_BASE = "https://sellercentral.amazon.com";

/** Seller Central consent page base URL by marketplace (NA focus for this app). */
const CONSENT_BASE_BY_MARKETPLACE: Record<string, string> = {
  [MARKETPLACE_IDS.USA]: "https://sellercentral.amazon.com",
  [MARKETPLACE_IDS.Canada]: "https://sellercentral.amazon.ca",
  [MARKETPLACE_IDS.Mexico]: "https://sellercentral.amazon.com.mx",
};

export const AMAZON_OAUTH_STATE_COOKIE = "amazon_sp_oauth_state";
export const AMAZON_OAUTH_MARKETPLACE_COOKIE = "amazon_sp_oauth_mp";

function isOAuthDraftEnabled(): boolean {
  const raw = process.env.SP_API_OAUTH_DRAFT?.trim();
  // Default to Draft (beta consent) when the env var isn't provided.
  // Your Amazon app is currently shown as Draft in Developer Central, so this prevents MD1000.
  if (!raw) return true;
  const v = raw.toLowerCase();
  return v === "1" || v === "true";
}

export function getOAuthAuthSecret(): string | null {
  const s =
    process.env.AUTH_SECRET?.trim() ??
    (process.env.NODE_ENV === "development"
      ? "dev-secret-replace-with-npx-auth-secret"
      : "");
  return s || null;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

function signOAuthStatePayload(secret: string, userId: string, state: string): string {
  return crypto.createHmac("sha256", secret).update(`${userId}.${state}`).digest("hex");
}

export function buildOAuthStateCookie(params: {
  secret: string;
  userId: string;
}): { state: string; cookieValue: string } {
  const state = generateOAuthState();
  const sig = signOAuthStatePayload(params.secret, params.userId, state);
  const raw = `${params.userId}.${state}.${sig}`;
  const cookieValue = Buffer.from(raw, "utf8").toString("base64url");
  return { state, cookieValue };
}

export function readOAuthStateCookie(
  cookieValue: string | undefined,
  secret: string,
): { userId: string; state: string } | null {
  if (!cookieValue) return null;
  try {
    const raw = Buffer.from(cookieValue, "base64url").toString("utf8");
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [userId, state, sig] = parts;
    if (!userId || !state || !sig) return null;
    const expected = signOAuthStatePayload(secret, userId, state);
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return { userId, state };
  } catch {
    return null;
  }
}

export function consentBaseUrlForMarketplace(marketplaceId: string | null | undefined): string {
  const override = process.env.SP_API_OAUTH_CONSENT_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  const id = marketplaceId?.trim();
  if (id && CONSENT_BASE_BY_MARKETPLACE[id]) {
    return CONSENT_BASE_BY_MARKETPLACE[id];
  }
  return DEFAULT_CONSENT_BASE;
}

export function buildSellerCentralConsentUrl(params: {
  applicationId: string;
  state: string;
  marketplaceId?: string | null;
}): string {
  const base = consentBaseUrlForMarketplace(params.marketplaceId ?? null);
  const url = new URL(`${base.replace(/\/$/, "")}/apps/authorize/consent`);
  url.searchParams.set("application_id", params.applicationId);
  url.searchParams.set("state", params.state);
  if (isOAuthDraftEnabled()) {
    url.searchParams.set("version", "beta");
  }
  return url.toString();
}

export async function exchangeSpApiAuthorizationCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{ ok: true; refreshToken: string } | { ok: false; error: string; status?: number }> {
  const clientId = process.env.SP_API_CLIENT_ID?.trim();
  const clientSecret = process.env.SP_API_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Missing SP_API_CLIENT_ID or SP_API_CLIENT_SECRET." };
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
    cache: "no-store",
  });

  const raw = await response.text();
  let json: Record<string, unknown> = {};
  if (raw) {
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }

  if (!response.ok) {
    const msg =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : raw.slice(0, 200) || "Token exchange failed.";
    return { ok: false, error: msg, status: response.status };
  }

  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  if (!refreshToken) {
    return { ok: false, error: "LWA response missing refresh_token." };
  }

  return { ok: true, refreshToken };
}

export function resolveMarketplaceForOAuth(mpCookie: string | undefined): string {
  const trimmed = mpCookie?.trim();
  if (trimmed && isAllowedMarketplaceId(trimmed)) {
    return trimmed;
  }
  return (
    process.env.MARKETPLACE_ID?.trim() ||
    process.env.SP_API_MARKETPLACE_ID?.trim() ||
    MARKETPLACE_IDS.USA
  );
}
