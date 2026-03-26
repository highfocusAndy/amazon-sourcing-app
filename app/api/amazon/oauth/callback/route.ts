import { auth } from "@/auth";
import { encryptAmazonRefreshToken } from "@/lib/amazonTokenCrypto";
import {
  AMAZON_OAUTH_MARKETPLACE_COOKIE,
  AMAZON_OAUTH_STATE_COOKIE,
  exchangeSpApiAuthorizationCode,
  getOAuthAuthSecret,
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

  const cookieState = request.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  const mpCookie = request.cookies.get(AMAZON_OAUTH_MARKETPLACE_COOKIE)?.value;

  const fail = (msg: string) =>
    NextResponse.redirect(`${base}/?amazon_error=${encodeURIComponent(msg)}`);

  if (!state || !cookieState || state !== cookieState) {
    return fail("Invalid or missing OAuth state. Try connecting again.");
  }
  if (!code?.trim() || !sellingPartnerId?.trim()) {
    return fail("Amazon did not return an authorization code.");
  }

  const session = await auth();
  if (!session?.user?.id) {
    return fail("Session expired. Sign in and connect Amazon again.");
  }

  const authSecret = getOAuthAuthSecret();
  if (!authSecret) {
    return fail("Server AUTH_SECRET is not configured.");
  }

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

  await prisma.amazonAccount.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
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

  try {
    await refreshAmazonStoreNameForUser(session.user.id);
  } catch {
    // Non-fatal: Explorer header can lazy-load store name via GET /api/settings/amazon-account
  }

  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.redirect(`${base}/?amazon_connected=1`);
  res.cookies.set(AMAZON_OAUTH_STATE_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
  });
  res.cookies.set(AMAZON_OAUTH_MARKETPLACE_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
  });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
