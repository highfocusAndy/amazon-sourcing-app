"use client";

import { useState, type FormEvent } from "react";

function PasswordChangeForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setErrorMsg("New passwords don't match");
      return;
    }
    if (next.length < 8) {
      setErrorMsg("New password must be at least 8 characters");
      return;
    }
    setErrorMsg(null);
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        setStatus("saved");
        setCurrent("");
        setNext("");
        setConfirm("");
        setTimeout(() => setStatus("idle"), 3500);
      } else {
        const d = (await res.json()) as { error?: string };
        setErrorMsg(d.error ?? "Failed to update password");
        setStatus("error");
        setTimeout(() => { setStatus("idle"); setErrorMsg(null); }, 4000);
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
      setTimeout(() => { setStatus("idle"); setErrorMsg(null); }, 4000);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-md space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Current admin password
        </label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-500/25"
          placeholder="Current password"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          New admin password
        </label>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-500/25"
          placeholder="New password (min 8 characters)"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-500/25"
          placeholder="Confirm new password"
        />
      </div>

      {errorMsg ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] px-3 py-2 text-[13px] text-rose-300">
          {errorMsg}
        </p>
      ) : null}

      {status === "saved" ? (
        <p className="rounded-lg border border-teal-500/30 bg-teal-500/[0.08] px-3 py-2 text-[13px] text-teal-300">
          Password updated successfully.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "saving" || !current || !next || !confirm}
        className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "saving" ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-8">
      <header className="border-b border-white/[0.06] pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Admin
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-[11px] font-medium text-slate-500">Settings</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[1.75rem]">
          Admin Settings
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
          Manage admin panel security. The ADMIN_PASSWORD env var must be set for the password system to be active.
        </p>
      </header>

      <section>
        <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)]">
          <h2 className="mb-1 text-base font-semibold text-white">Change Admin Password</h2>
          <p className="mb-6 text-sm text-slate-500">
            This is the <strong className="text-slate-300">secondary admin-panel password</strong> — completely separate from your regular app login password. It is stored as a bcrypt hash in the database. The ADMIN_PASSWORD env var is only used as a fallback if no DB hash exists yet.
          </p>
          <PasswordChangeForm />
        </div>
      </section>
    </div>
  );
}
