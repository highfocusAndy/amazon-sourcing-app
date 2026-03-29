"use client";

import { useState } from "react";
import Link from "next/link";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNoAccount(false);
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        emailSent?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      if (data.emailSent === false) {
        setNoAccount(true);
        setLoading(false);
        return;
      }
      if (data.emailSent === true) {
        setSuccess(true);
        setLoading(false);
        return;
      }
      setError("Something went wrong. Try again.");
    } catch {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  if (noAccount) {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-950">
        <p className="font-medium">No account exists for this email.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <Link href="/login" className="inline-block font-semibold text-teal-700 hover:underline sm:py-2.5">
            Back to sign in
          </Link>
          <Link
            href="/get-access"
            className="inline-block rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-500"
          >
            Get access
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-center text-sm text-emerald-800">
        <p className="font-medium">Reset link sent. Check your email.</p>
        <Link href="/login" className="mt-4 inline-block font-medium text-teal-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <label className="text-sm font-medium text-slate-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-teal-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
