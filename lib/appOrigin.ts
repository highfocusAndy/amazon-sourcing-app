/**
 * Public HTTPS (or http localhost) origin for absolute links in emails and redirects.
 * Prefer NEXTAUTH_URL; optional APP_BASE_URL override.
 */
export function appOrigin(): string {
  const raw = (process.env.NEXTAUTH_URL ?? process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) {
    if (process.env.NODE_ENV === "development") return "http://localhost:3000";
    throw new Error("NEXTAUTH_URL (or APP_BASE_URL) must be set for password reset emails.");
  }
  return raw;
}
