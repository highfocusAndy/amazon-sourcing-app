export function createPasskeyLoginSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPasskeyLoginSecret(secret: string): Promise<string> {
  const enc = new TextEncoder().encode(secret);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
