"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInAfterRegistration } from "@/lib/auth/signInAfterRegistration";

const G = "#C9A84C";

export function BuyerRegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register/buyer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; email?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }
      const signInResult = await signInAfterRegistration(data.email ?? email, password);
      if (!signInResult.ok) {
        setError(signInResult.error);
        return;
      }
      router.push("/buyer");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/40";

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-center text-[13px] text-red-300">
          {error}
        </p>
      )}

      <label className="block text-[13px] font-medium text-slate-300">
        Name <span className="text-slate-500">(optional)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder="Your name"
          className={inputCls}
        />
      </label>

      <label className="block text-[13px] font-medium text-slate-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className={inputCls}
        />
      </label>

      <label className="block text-[13px] font-medium text-slate-300">
        Password <span className="text-slate-500">(min 8 characters)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>

      <label className="block text-[13px] font-medium text-slate-300">
        Confirm password
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full rounded-xl py-3.5 text-sm font-bold transition disabled:opacity-50"
        style={{ background: G, color: "#0a0800" }}
      >
        {loading ? "Creating account…" : "Start Browsing Free →"}
      </button>

      <p className="text-center text-[11px] text-slate-600">
        No credit card required. By continuing you agree to our{" "}
        <Link href="/terms" className="underline hover:text-slate-400">Terms</Link>
        {" "}and{" "}
        <Link href="/privacy" className="underline hover:text-slate-400">Privacy Policy</Link>.
      </p>

      <p className="text-center text-[12px] text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold hover:text-slate-300" style={{ color: G }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
