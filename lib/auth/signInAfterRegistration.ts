"use server";

import { signIn } from "@/auth";

export type SignInAfterRegistrationResult = { ok: true } | { ok: false; error: string };

/**
 * Call right after a registration API succeeds. Server-side `signIn` applies session cookies via
 * Next.js `cookies()`; `signIn` from `next-auth/react` uses `fetch`, and some browsers / cookie
 * policies do not persist those Set-Cookie headers reliably for the callback request.
 */
export async function signInAfterRegistration(
  email: string,
  password: string,
): Promise<SignInAfterRegistrationResult> {
  const em = email.trim().toLowerCase();
  if (!em || !password) {
    return { ok: false, error: "Missing email or password." };
  }
  try {
    await signIn("credentials", {
      email: em,
      password,
      redirect: false,
    });
    return { ok: true };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest?: unknown }).digest === "string" &&
      String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    if (e && typeof e === "object" && "url" in e && typeof (e as { url?: string }).url === "string") {
      return { ok: true };
    }
    if (e && typeof e === "object" && "type" in e && (e as { type: string }).type === "CallbackRouteHandlerError") {
      return { ok: false, error: "Could not start your session. Try logging in manually." };
    }
    if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      String((e as { message: string }).message).toLowerCase().includes("credential")
    ) {
      return { ok: false, error: "Could not start your session. Try logging in manually." };
    }
    return { ok: false, error: "Could not start your session. Try logging in manually." };
  }
}
