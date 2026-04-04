/**
 * Canonical public origin for metadata, sitemap, and robots (uses deploy env at build/runtime).
 * Does not replace NEXTAUTH_URL for auth — that should still be set explicitly in production.
 */
export function publicSiteOrigin(): URL {
  const raw =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (raw) {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return new URL(withScheme.replace(/\/$/, ""));
    } catch {
      /* fall through */
    }
  }
  return new URL("http://localhost:3000");
}
