import type { NextRequest } from "next/server";

/** Canonical public base URL for OAuth redirect_uri (no trailing slash). */
export function getAppBaseUrl(request: NextRequest): string {
  const env =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.APP_BASE_URL?.trim();
  if (env) {
    return env.replace(/\/$/, "");
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`.replace(/\/$/, "");
}
