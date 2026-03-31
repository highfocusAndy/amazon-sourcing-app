import { auth } from "@/auth";
import { loadBillingUser } from "@/lib/billing/access";
import { encryptAmazonRefreshToken } from "@/lib/amazonTokenCrypto";
import {
  AMAZON_OAUTH_MARKETPLACE_COOKIE,
  AMAZON_OAUTH_STATE_COOKIE,
  exchangeSpApiAuthorizationCode,
  getOAuthAuthSecret,
  readOAuthStateCookie,
  resolveMarketplaceForOAuth,
} from "@/lib/amazonOAuth";
import { refreshAmazonStoreNameForUser } from "@/lib/amazonAccount";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * Receives spapi_oauth_code from Amazon and exchanges it for a refresh token (stored encrypted).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const base = getAppBaseUrl(request);
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const code = searchParams.get("spapi_oauth_code");
  const sellingPartnerId = searchParams.get("selling_partner_id");

  const cookieStateRaw = request.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  const mpCookie = request.cookies.get(AMAZON_OAUTH_MARKETPLACE_COOKIE)?.value;

  const fail = (msg: string) =>
    NextResponse.redirect(`${base}/?amazon_error=${encodeURIComponent(msg)}`);

  const authSecret = getOAuthAuthSecret();
  if (!authSecret) {
    return fail("Server AUTH_SECRET is not configured.");
  }
  const stateCookie = readOAuthStateCookie(cookieStateRaw, authSecret);
  if (!state || !stateCookie || state !== stateCookie.state) {
    return fail("Invalid or missing OAuth state. Try connecting again.");
  }
  if (!code?.trim() || !sellingPartnerId?.trim()) {
    return fail("Amazon did not return an authorization code.");
  }

  const session = await auth();
  const fallbackUserId = stateCookie.userId;
  const user = session?.user?.id
    ? await loadBillingUser(session.user.id, session.user.email)
    : await loadBillingUser(fallbackUserId, null);
  if (!user) {
    return fail("User account not found. Sign out and sign in again, then reconnect Amazon.");
  }
  const userId = user.id;

  const redirectUri = `${base}/api/amazon/oauth/callback`;
  const exchanged = await exchangeSpApiAuthorizationCode({
    code: code.trim(),
    redirectUri,
  });

  if (!exchanged.ok) {
    return fail(exchanged.error);
  }

  const enc = encryptAmazonRefreshToken(exchanged.refreshToken, authSecret);
  const oauthMp = resolveMarketplaceForOAuth(mpCookie);

  try {
    await prisma.amazonAccount.upsert({
      where: { userId },
      create: {
        userId,
        amazonEmail: null,
        amazonPasswordHash: null,
        spRefreshTokenEnc: enc,
        sellerId: sellingPartnerId.trim(),
        oauthMarketplaceId: oauthMp,
      },
      update: {
        spRefreshTokenEnc: enc,
        sellerId: sellingPartnerId.trim(),
        oauthMarketplaceId: oauthMp,
      },
    });
  } catch (e) {
    // Most common prod failure: JWT session refers to a userId that no longer exists in the DB (volume reset).
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2003") {
      return fail("Your session is out of sync with the database. Sign out and sign in again, then reconnect Amazon.");
    }
    console.error("Amazon OAuth callback upsert error:", e);
    return fail("Could not save Amazon authorization. Please try again.");
  }

  try {
    await refreshAmazonStoreNameForUser(userId);
  } catch {
    // Non-fatal: Explorer header can lazy-load store name via GET /api/settings/amazon-account
  }

  const secure = base.startsWith("https://");
  const sameSite = secure ? "none" : "lax";
  const res = NextResponse.redirect(`${base}/?amazon_connected=1`);
  res.cookies.set(AMAZON_OAUTH_STATE_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure,
    sameSite,
  });
  res.cookies.set(AMAZON_OAUTH_MARKETPLACE_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure,
    sameSite,
  });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
