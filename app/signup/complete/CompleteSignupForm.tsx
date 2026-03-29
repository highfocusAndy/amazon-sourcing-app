"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

type Props = {
  sessionId: string;
  email: string;
};

export function CompleteSignupForm({ sessionId, email }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pw = password.trim();
    const pw2 = confirmPassword.trim();
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/register/from-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, password: pw, name: name.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string; email?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        return;
      }
      const signEmail = data.email ?? email;
      const result = await signIn("credentials", {
        email: signEmail,
        password: pw,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Account created but sign-in failed. Try signing in manually.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-600">
        Email for this subscription:{" "}
        <span className="font-medium text-slate-900">{email}</span> (from checkout — cannot be changed here)
      </p>
      <label className="text-sm font-medium text-slate-700">
        Name <span className="text-slate-400">(optional)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Password <span className="text-slate-400">(min 8 characters)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
        />
      </label>
      <label className="text-sm font-medium text-slate-700">
        Confirm password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/50"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 disabled:opacity-50"
      >
        {loading ? "Creating account…" : "Create account and sign in"}
      </button>
      <p className="text-center text-sm text-slate-500">
        <Link href="/get-access" className="text-teal-600 hover:underline">
          Back to get access
        </Link>
      </p>
    </form>
  );
}
