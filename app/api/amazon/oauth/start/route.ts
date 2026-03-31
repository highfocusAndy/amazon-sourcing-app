import { auth } from "@/auth";
import { userHasAppAccess } from "@/lib/billing/access";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { prisma } from "@/lib/db";
import {
  AMAZON_OAUTH_MARKETPLACE_COOKIE,
  AMAZON_OAUTH_STATE_COOKIE,
  buildOAuthStateCookie,
  buildSellerCentralConsentUrl,
  getOAuthAuthSecret,
  resolveMarketplaceForOAuth,
} from "@/lib/amazonOAuth";
import { NextRequest, NextResponse } from "next/server";

/**
 * Begins SP-API website OAuth: sets CSRF cookie and redirects to Seller Central consent.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const base = getAppBaseUrl(request);
  const session = await auth();
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("callbackUrl", "/api/amazon/oauth/start");
    return NextResponse.redirect(loginUrl);
  }

  if (!(await userHasAppAccess(session.user.id, session.user.email))) {
    return NextResponse.redirect(new URL("/subscribe", base));
  }

  const appId = process.env.SP_API_APPLICATION_ID?.trim();
  if (!appId) {
    return NextResponse.redirect(
      `${base}/?amazon_error=${encodeURIComponent(
        "Server missing SP_API_APPLICATION_ID. Add your Selling Partner application ID from Developer Central (.env).",
      )}`,
    );
  }

  let marketplaceId: string;
  try {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
      select: { marketplaceId: true },
    });
    marketplaceId =
      prefs?.marketplaceId?.trim() || resolveMarketplaceForOAuth(undefined);
  } catch (e) {
    console.error("OAuth start: could not load marketplace preference:", e);
    marketplaceId = resolveMarketplaceForOAuth(undefined);
  }

  const authSecret = getOAuthAuthSecret();
  if (!authSecret) {
    return NextResponse.redirect(
      `${base}/?amazon_error=${encodeURIComponent("Server AUTH_SECRET is not configured.")}`,
    );
  }
  const { state, cookieValue } = buildOAuthStateCookie({
    secret: authSecret,
    userId: session.user.id,
  });
  const consentUrl = buildSellerCentralConsentUrl({
    applicationId: appId,
    state,
    marketplaceId,
  });

  const res = NextResponse.redirect(consentUrl);
  const secure = base.startsWith("https://");
  const sameSite = secure ? "none" : "lax";
  res.cookies.set(AMAZON_OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure,
    // On localhost/http, SameSite=None would be rejected unless Secure=true.
    sameSite,
    path: "/",
    maxAge: 60 * 15,
  });
  res.cookies.set(AMAZON_OAUTH_MARKETPLACE_COOKIE, marketplaceId, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: 60 * 15,
  });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
