"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function ConfirmResetClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This link is missing a token. Use the link from your email or request a new reset.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not reset password.");
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  }

  if (!token) {
    return (
      <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">Invalid link</p>
        <p className="mt-1">
          Open the reset link from your email, or{" "}
          <Link href="/reset-password" className="font-semibold text-teal-700 underline hover:text-teal-600">
            request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-center text-sm text-emerald-800">
        <p className="font-medium">Password updated</p>
        <p className="mt-1">You can sign in with your new password.</p>
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
      <p className="text-sm text-slate-600">Choose a new password for your account.</p>
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
      <label className="text-sm font-medium text-slate-700">
        Confirm new password
        <input
          type="password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
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
        {loading ? "Saving…" : "Save new password"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-teal-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
