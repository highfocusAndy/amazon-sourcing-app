/** Extract base64url `challenge` from WebAuthn clientDataJSON. */
export function challengeFromClientDataJSON(clientDataJSON: string): string | null {
  try {
    const json = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as {
      challenge?: string;
    };
    return typeof json.challenge === "string" ? json.challenge : null;
  } catch {
    return null;
  }
}
