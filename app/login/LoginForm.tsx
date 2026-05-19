"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
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
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
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

  const inputCls =
    "mt-1.5 w-full rounded-xl px-3.5 py-3 text-[15px] text-slate-100 outline-none transition placeholder:text-slate-600";
  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.10)",
  };
  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {/* Error messages */}
      {(error || (errorParam && !error)) && (
        <p
          className="rounded-xl px-3.5 py-2.5 text-[13px] text-red-300"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}
        >
          {error ?? "Invalid email or password."}
        </p>
      )}

      {/* Email */}
      <label className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">
        Email
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={inputCls}
          style={inputStyle}
          onFocus={(e) => {
            e.target.style.border = "1px solid rgba(201,168,76,0.55)";
            e.target.style.boxShadow = "0 0 0 3px rgba(201,168,76,0.12)";
          }}
          onBlur={(e) => {
            e.target.style.border = inputStyle.border;
            e.target.style.boxShadow = "";
          }}
        />
      </label>

      {/* Password */}
      <label className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">
        Password
        <input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={inputCls}
          style={inputStyle}
          onFocus={(e) => {
            e.target.style.border = "1px solid rgba(201,168,76,0.55)";
            e.target.style.boxShadow = "0 0 0 3px rgba(201,168,76,0.12)";
          }}
          onBlur={(e) => {
            e.target.style.border = inputStyle.border;
            e.target.style.boxShadow = "";
          }}
        />
      </label>

      {/* Primary CTA — gold gradient */}
      <button
        type="submit"
        disabled={loading || passkeyLoading}
        className="mt-1 w-full rounded-xl px-4 py-3.5 text-[15px] font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, #E8CC7A 0%, #C9A84C 55%, #9A7830 100%)",
          boxShadow: loading ? "none" : "0 0 28px -6px rgba(201,168,76,0.45)",
        }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {/* Divider */}
      <div className="relative py-1 text-center">
        <div
          className="absolute inset-x-0 top-1/2 h-px"
          style={{ background: "rgba(255,255,255,0.07)" }}
        />
        <span className="relative px-3 text-[12px] uppercase tracking-wider text-slate-600">
          or
        </span>
      </div>

      {/* Passkey button — gold outline */}
      <button
        type="button"
        onClick={() => void handlePasskeySignIn()}
        disabled={loading || passkeyLoading}
        className="w-full rounded-xl px-4 py-3.5 text-[15px] font-semibold text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(201,168,76,0.28)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.07)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.5)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.28)";
        }}
      >
        {passkeyLoading ? "Waiting for device…" : "🔑 Sign in with passkey"}
      </button>
      <p className="text-center text-[12px] leading-snug text-slate-600">
        Face ID, fingerprint, or device PIN — add a passkey in Account settings first.
      </p>

      {supportEmail ? <SupportContactHint email={supportEmail} /> : null}
    </form>
  );
}
