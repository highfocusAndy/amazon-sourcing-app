"use client";

import { useState } from "react";
import Link from "next/link";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), newPassword }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to reset password.");
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-center text-sm text-emerald-800">
        <p className="font-medium">Password updated.</p>
        <p className="mt-1">Sign in with your new password.</p>
        <Link href="/login" className="mt-3 inline-block font-medium text-teal-600 hover:underline">
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
      <p className="text-sm text-slate-600">
        Enter your account email and a new password. Only available in development.
      </p>
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
      <label className="text-sm font-medium text-slate-700">
        New password <span className="text-slate-400">(min 8 characters)</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50"
      >
        {loading ? "Updating…" : "Set new password"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-teal-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
