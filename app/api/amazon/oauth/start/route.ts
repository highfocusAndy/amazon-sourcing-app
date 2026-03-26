import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { prisma } from "@/lib/db";
import {
  AMAZON_OAUTH_MARKETPLACE_COOKIE,
  AMAZON_OAUTH_STATE_COOKIE,
  buildSellerCentralConsentUrl,
  generateOAuthState,
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

  const state = generateOAuthState();
  const consentUrl = buildSellerCentralConsentUrl({
    applicationId: appId,
    state,
    marketplaceId,
  });

  const res = NextResponse.redirect(consentUrl);
  const secure = true;
  res.cookies.set(AMAZON_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    // OAuth is a cross-site redirect; ensure the state cookie is sent back on callback.
    sameSite: "none",
    path: "/",
    maxAge: 60 * 15,
  });
  res.cookies.set(AMAZON_OAUTH_MARKETPLACE_COOKIE, marketplaceId, {
    httpOnly: true,
    secure,
    sameSite: "none",
    path: "/",
    maxAge: 60 * 15,
  });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
