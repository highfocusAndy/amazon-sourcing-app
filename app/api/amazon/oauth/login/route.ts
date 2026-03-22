import { auth } from "@/auth";
import { AMAZON_OAUTH_STATE_COOKIE } from "@/lib/amazonOAuth";
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
    NextResponse.redirect(`${base}/settings?amazon_error=${encodeURIComponent(msg)}`);

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

  const stateCookie = request.cookies.get(AMAZON_OAUTH_STATE_COOKIE)?.value;
  if (!stateCookie) {
    return failRedirect("OAuth session expired. Please try Connect Amazon again.");
  }

  const session = await auth();
  if (!session?.user?.id) {
    const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("callbackUrl", returnPath);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const redirectUri = `${base}/api/amazon/oauth/callback`;
  const confirm = new URL(amazonCallbackUri);
  confirm.searchParams.set("redirect_uri", redirectUri);
  confirm.searchParams.set("amazon_state", amazonState);
  confirm.searchParams.set("state", stateCookie);
  const draft =
    process.env.SP_API_OAUTH_DRAFT?.trim() === "1" ||
    process.env.SP_API_OAUTH_DRAFT?.trim().toLowerCase() === "true";
  if (draft) {
    confirm.searchParams.set("version", "beta");
  }

  const res = NextResponse.redirect(confirm.toString());
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
