import {
  AMAZON_OAUTH_STATE_COOKIE,
  getOAuthAuthSecret,
  readOAuthStateCookie,
} from "@/lib/amazonOAuth";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { NextRequest, NextResponse } from "next/server";

/**
 * SP-API "Login URI": Amazon redirects here after consent. We forward the seller to Amazon's confirm URL.
 * @see https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const amazonCallbackUri = searchParams.get("amazon_callback_uri");
  const amazonState = searchParams.get("amazon_state");

  const base = getAppBaseUrl(request);
  const failRedirect = (msg: string) =>
    NextResponse.redirect(`${base}/?amazon_error=${encodeURIComponent(msg)}`);

  if (!amazonCallbackUri || !amazonState) {
    return failRedirect("Missing Amazon OAuth parameters. Start from Connect Amazon again.");
  }

  try {
    const u = new URL(amazonCallbackUri);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return failRedirect("Invalid amazon_callback_uri from Amazon.");
    }
  } catch {
    return failRedirect("Invalid amazon_callback_uri from Amazon.");
  }

  const authSecret = getOAuthAuthSecret();
  const stateCookieRaw = request.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  const stateCookie = authSecret ? readOAuthStateCookie(stateCookieRaw, authSecret) : null;
  if (!stateCookie) {
    return failRedirect("OAuth session expired. Please try Connect Amazon again.");
  }

  const redirectUri = `${base}/api/amazon/oauth/callback`;
  const confirm = new URL(amazonCallbackUri);
  confirm.searchParams.set("redirect_uri", redirectUri);
  confirm.searchParams.set("amazon_state", amazonState);
  confirm.searchParams.set("state", stateCookie.state);
  // Keep the same "beta for Draft apps" behavior as buildSellerCentralConsentUrl
  const raw = process.env.SP_API_OAUTH_DRAFT?.trim();
  const isDraft =
    !raw || raw.toLowerCase() === "1" || raw.toLowerCase() === "true";
  if (isDraft) {
    confirm.searchParams.set("version", "beta");
  }

  const res = NextResponse.redirect(confirm.toString());
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
