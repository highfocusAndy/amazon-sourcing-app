import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const oauthSp = req.nextUrl.searchParams;
  if (oauthSp.has("amazon_error") || oauthSp.get("amazon_connected") === "1") {
    const url = req.nextUrl.clone();
    url.searchParams.delete("amazon_error");
    url.searchParams.delete("amazon_connected");
    return NextResponse.redirect(url);
  }

  const isPublicPage =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/get-access") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/terms") ||
    path.startsWith("/privacy") ||
    path.startsWith("/billing") ||
    path.startsWith("/register");
  /** Crawlers must read these without a session (avoid redirect to /login). */
  const isSeoMetadataRoute = path === "/sitemap.xml" || path === "/robots.txt";
  /** PWA: manifest + service worker must not 302 to login (install / audits). */
  const isPwaPublicAsset = path === "/manifest.webmanifest" || path === "/sw.js";

  /**
   * NextAuth v5 runs this custom callback before the default "redirect if unauthorized"
   * branch, so unauthenticated users would otherwise always get NextResponse.next() and
   * see the dashboard. Send them to /login first; after sign-in they return via callbackUrl.
   */
  // Session JSON is always an object when present; use `user` like auth.ts `authorized` callback.
  const isLoggedIn = Boolean(req.auth?.user);
  if (!path.startsWith("/api/") && !isPublicPage && !isSeoMetadataRoute && !isPwaPublicAsset && !isLoggedIn) {
    const signIn = new URL("/login", req.nextUrl);
    const callback = `${path}${req.nextUrl.search}`;
    signIn.searchParams.set("callbackUrl", callback);
    const loginRedirect = NextResponse.redirect(signIn);
    loginRedirect.cookies.delete("admin_auth_v2");
    return loginRedirect;
  }

  // When an authenticated user navigates away from /admin (page load only), delete the
  // admin password cookie so it is required again on the next admin visit.
  // Do not clear on /api/* — background calls (e.g. NextAuth session refresh) were
  // wiping admin_auth_v2 while the user was still on /admin, breaking feature-flag saves.
  const isAdminPath = path.startsWith("/admin") || path.startsWith("/api/admin");
  const isPageNavigation = !path.startsWith("/api/");
  const isRscPrefetch =
    req.headers.get("RSC") === "1" && req.headers.get("Next-Router-Prefetch") === "1";
  const hasAdminCookie = Boolean(req.cookies.get("admin_auth_v2")?.value);

  if (isLoggedIn && hasAdminCookie && isPageNavigation && !isAdminPath && !isRscPrefetch) {
    const res = NextResponse.next();
    res.cookies.delete("admin_auth_v2");
    return res;
  }

  // Static category tree only (no SP-API). Catalog search requires a session to protect SP-API usage.
  const isCatalogGet =
    path === "/api/catalog/categories" &&
    (typeof req.method === "undefined" || req.method === "GET");
  const isDebugGet =
    process.env.NODE_ENV === "development" &&
    path.startsWith("/api/debug/") &&
    (typeof req.method === "undefined" || req.method === "GET");
  const isResetPasswordDev =
    process.env.NODE_ENV === "development" &&
    path === "/api/reset-password/dev" &&
    req.method === "POST";
  const isPasswordResetPublic =
    (path === "/api/reset-password/request" || path === "/api/reset-password/confirm") &&
    req.method === "POST";
  /** SP-API website OAuth: Amazon redirects the browser here before the app session may exist. */
  const isAmazonOAuthPublicGet =
    (path === "/api/amazon/oauth/login" || path === "/api/amazon/oauth/callback") &&
    (typeof req.method === "undefined" || req.method === "GET");
  /**
   * OAuth start must be reachable without a session so the route can redirect to /login?callbackUrl=…
   * (otherwise middleware returned 401 JSON and "Connect Amazon" looked broken).
   */
  const isAmazonOAuthStartGet =
    path === "/api/amazon/oauth/start" &&
    (typeof req.method === "undefined" || req.method === "GET");
  const isPasskeyLoginPost =
    (path === "/api/passkeys/login/options" || path === "/api/passkeys/login/verify") &&
    req.method === "POST";
  const isStripeWebhook =
    path === "/api/billing/webhook" && (req.method === "POST" || typeof req.method === "undefined");
  if (
    path.startsWith("/api/") &&
    !path.startsWith("/api/auth") &&
    !path.startsWith("/api/register") &&
    !(
      path.startsWith("/api/billing/checkout-guest") ||
      path.startsWith("/api/billing/resume-signup")
    ) &&
    !isCatalogGet &&
    !isDebugGet &&
    !isResetPasswordDev &&
    !isPasswordResetPublic &&
    !isAmazonOAuthPublicGet &&
    !isAmazonOAuthStartGet &&
    !isPasskeyLoginPost &&
    !isStripeWebhook &&
    !req.auth?.user
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (auth API - handled by NextAuth route)
     * - _next/static, _next/image, favicon, images
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
