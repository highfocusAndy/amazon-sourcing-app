"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";

export function AdminPasswordGate() {
  const { update } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        await update({ adminVerified: true });
        window.location.reload();
      } else {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? "Incorrect password");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur">
          <div className="mb-6 text-center">
            <span className="inline-block rounded-md border border-teal-400/35 bg-teal-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-100 shadow-[0_0_24px_-4px_rgb(45_212_191/0.3)]">
              Admin
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-white">
              Admin password required
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter your admin password to access the panel.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Admin password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-500/25"
                placeholder="Enter admin password"
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 py-2 text-[13px] text-rose-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-xl bg-teal-500 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
