"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { SupportContactHint } from "@/app/components/SupportContactHint";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";

type LoginFormProps = {
  /** When set (from SUPPORT_EMAIL), shown under the get-access path */
  supportEmail?: string;
};

export function LoginForm({ supportEmail }: LoginFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const emailParam = searchParams.get("email") ?? "";
  const errorParam = searchParams.get("error") ?? "";
  const [email, setEmail] = useState(() =>
    emailParam ? decodeURIComponent(emailParam) : ""
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    if (errorParam === "CredentialsSignin" || errorParam === "Credentials") {
      const params = new URLSearchParams();
      if (emailParam) params.set("email", emailParam);
      if (callbackUrl && callbackUrl !== "/") params.set("callbackUrl", callbackUrl);
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
    }
  }, [errorParam, emailParam, callbackUrl, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const pw = password.trim();
    if (!pw) {
      setError("Enter your password.");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password: pw,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Invalid email or password.");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeySignIn() {
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em) {
      setError("Enter your email first so we can find your passkey.");
      return;
    }
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setError("Passkeys are not supported in this browser.");
      return;
    }
    setPasskeyLoading(true);
    try {
      const optRes = await fetch("/api/passkeys/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: em }),
      });
      const optData = (await optRes.json()) as PublicKeyCredentialRequestOptionsJSON & { error?: string };
      if (!optRes.ok) {
        setError(optData.error ?? "Passkey sign-in failed.");
        return;
      }

      const assertion = await startAuthentication(optData);

      const verifyRes = await fetch("/api/passkeys/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ response: assertion }),
      });
      const verifyJson = (await verifyRes.json()) as { token?: string; error?: string };
      if (!verifyRes.ok || !verifyJson.token) {
        setError(verifyJson.error ?? "Passkey verification failed.");
        return;
      }

      const result = await signIn("credentials", {
        passkeyToken: verifyJson.token,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Could not start your session. Try again.");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch (e) {
      const userDismissed =
        (typeof DOMException !== "undefined" &&
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "AbortError")) ||
        (e instanceof Error &&
          (/abort|cancel/i.test(e.message) ||
            e.name === "NotAllowedError" ||
            e.name === "AbortError"));
      if (!userDismissed) {
        setError(e instanceof Error ? e.message : "Passkey failed.");
      }
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5 sm:mt-5 sm:gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-base text-red-700">
          {error}
        </p>
      )}
      {errorParam && !error && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-base text-red-700">
          Invalid email or password.
        </p>
      )}
      <p className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm leading-snug text-slate-600">
        Sign in with the <strong className="font-semibold text-slate-800">email and password you chose for this app</strong>{" "}
        (from Get access / your invite code). That is separate from linking your{" "}
        <strong className="font-semibold text-slate-800">Amazon seller</strong> account inside the app after you sign in.
      </p>
      <label className="text-base font-medium text-slate-700">
        Email
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
          placeholder="you@example.com"
        />
      </label>
      <label className="text-base font-medium text-slate-700">
        Password
        <input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
        />
      </label>
      <button
        type="submit"
        disabled={loading || passkeyLoading}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <div className="relative py-0.5 text-center text-sm text-slate-400 before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-slate-200">
        <span className="relative bg-white px-2">or</span>
      </div>
      <button
        type="button"
        onClick={() => void handlePasskeySignIn()}
        disabled={loading || passkeyLoading}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3.5 text-base font-semibold text-slate-800 shadow-sm hover:border-teal-500/60 hover:bg-teal-50/50 transition-all disabled:opacity-50"
      >
        {passkeyLoading ? "Waiting for device…" : "Sign in with passkey"}
      </button>
      <p className="text-center text-sm leading-snug text-slate-500">
        Face ID, fingerprint, or device PIN — after you add a passkey in Account settings (password sign-in once).
      </p>
      <div className="relative py-0.5 text-center text-sm text-slate-400 before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-slate-200">
        <span className="relative bg-white px-2">or</span>
      </div>
      <Link
        href="/get-access"
        className="flex w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-4 py-3.5 text-center text-base font-semibold text-slate-800 shadow-sm hover:border-teal-500/60 hover:bg-teal-50/50 transition-all"
      >
        Pay or use a promo code
      </Link>
      <p className="text-center text-sm leading-snug text-slate-500">
        New here? Subscribe or enter an invite code on the next page.
      </p>
      {supportEmail ? <SupportContactHint email={supportEmail} /> : null}
    </form>
  );
}
