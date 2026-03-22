"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loginAction, type LoginResult } from "./actions";

export function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const emailParam = searchParams.get("email") ?? "";
  const errorParam = searchParams.get("error") ?? "";
  const [email, setEmail] = useState(() =>
    emailParam ? decodeURIComponent(emailParam) : ""
  );
  const [password, setPassword] = useState("");
  const [state, formAction] = useActionState<LoginResult, FormData>(loginAction, {});
  const error = state?.error ?? null;
  const loading = false;

  useEffect(() => {
    if (errorParam === "CredentialsSignin" || errorParam === "Credentials") {
      const params = new URLSearchParams();
      if (emailParam) params.set("email", emailParam);
      if (callbackUrl && callbackUrl !== "/") params.set("callbackUrl", callbackUrl);
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
    }
  }, [errorParam, emailParam, callbackUrl, router]);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {errorParam && !error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Invalid email or password.
        </p>
      )}
      <label className="text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
          placeholder="you@example.com"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Password
        <input
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50"
      >
        Sign in
      </button>
    </form>
  );
}
