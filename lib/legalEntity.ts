import { appDisplayName } from "@/lib/appBranding";
import { supportContactEmail } from "@/lib/supportContact";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Legal / policy pages — displayed operator name (set NEXT_PUBLIC_LEGAL_ENTITY in prod). */
export function legalOperatorName(): string {
  const name = process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim();
  return name || appDisplayName;
}

/** Contact shown on legal pages — prefers SUPPORT_EMAIL, then NEXT_PUBLIC_SUPPORT_EMAIL. */
export function legalPublicContactEmail(): string | undefined {
  const pub = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (pub && EMAIL_RE.test(pub)) return pub;
  return supportContactEmail();
}
