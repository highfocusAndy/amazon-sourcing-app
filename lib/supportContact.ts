const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Optional support address from SUPPORT_EMAIL (not a secret — safe to render on pages).
 * Used for signup / billing help; omit the env var to hide the block.
 */
export function supportContactEmail(): string | undefined {
  const raw = process.env.SUPPORT_EMAIL?.trim();
  if (!raw || !EMAIL_RE.test(raw)) return undefined;
  return raw;
}
