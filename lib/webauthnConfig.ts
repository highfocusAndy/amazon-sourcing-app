export type WebAuthnConfig = {
  rpID: string;
  rpName: string;
  /** Allowed browser origins for registration/authentication verification */
  origins: string[];
};

function appOriginFromEnv(): string {
  const base =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!base) return "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

/** Comma-separated extra origins (e.g. alternate deploy URLs). Safe when env is unset. */
function parseExtraOrigins(): string[] {
  const raw = process.env.WEBAUTHN_EXTRA_ORIGINS?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getWebAuthnConfig(): WebAuthnConfig {
  const defaultOrigin = appOriginFromEnv();
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "HIGH FOCUS Sourcing";
  const rpID =
    process.env.WEBAUTHN_RP_ID?.trim() ||
    (defaultOrigin ? new URL(defaultOrigin).hostname : "");

  const extra = parseExtraOrigins();
  const origins = [...new Set([defaultOrigin, ...extra].filter(Boolean))];

  if (!rpID && process.env.NODE_ENV === "production") {
    throw new Error(
      "Set WEBAUTHN_RP_ID (or NEXTAUTH_URL / AUTH_URL so the RP ID can be derived) for passkeys in production.",
    );
  }

  return { rpName, rpID, origins };
}
