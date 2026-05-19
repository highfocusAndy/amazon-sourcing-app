"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  THEMES,
  type ThemeId,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  DEFAULT_MODE,
  type AppMode,
  applyTheme,
  applyMode,
  persistAppearanceCookies,
} from "@/lib/theme";

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

function AdminThemeSection() {
  // Always initialise with SSR-safe defaults so server and client
  // render identical HTML. localStorage is read in useEffect after mount.
  const [activeTheme, setActiveTheme] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [mode, setMode] = useState<AppMode>(DEFAULT_MODE);

  useEffect(() => {
    // Reading browser storage after hydration is the correct SSR-safe pattern here —
    // the linter rule is too strict for this one-time initialisation use case.
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedTheme && THEMES.some((t) => t.id === savedTheme)) setActiveTheme(savedTheme);
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as AppMode | null;
    if (savedMode === "dark" || savedMode === "light") setMode(savedMode);
    persistAppearanceCookies();
  }, []);

  function handleThemeChange(id: ThemeId) {
    const theme = THEMES.find((t) => t.id === id);
    setActiveTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    applyTheme(id, true);
    if (theme) {
      const themeMode = theme.mode as AppMode;
      setMode(themeMode);
      localStorage.setItem(MODE_STORAGE_KEY, themeMode);
    }
    persistAppearanceCookies();
  }

  function handleModeChange(m: AppMode) {
    setMode(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
    persistAppearanceCookies();
    document.documentElement.classList.add("theme-switching");
    setTimeout(() => document.documentElement.classList.remove("theme-switching"), 450);
    applyMode(m);
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)]">
      <h2 className="mb-1 text-base font-semibold text-white">App Appearance</h2>
      <p className="mb-6 text-sm text-slate-500">
        Changes apply instantly everywhere — admin panel and workspace. No page reload needed.
      </p>

      {/* Theme swatches */}
      <div className="mb-8">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Theme
        </label>
        <p className="mb-4 text-xs text-slate-600">
          Sets the accent colour and ambient glow across the admin panel and workspace.
        </p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {THEMES.map((theme) => {
            const isActive = activeTheme === theme.id;
            const isLight = theme.mode === "light";
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeChange(theme.id as ThemeId)}
                aria-label={`${theme.label}${isActive ? " (active)" : ""}`}
                className="group flex flex-col items-center gap-1.5 transition-all"
              >
                <span
                  className={`invert-exempt relative flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all duration-150 ${
                    isActive
                      ? "scale-110 ring-2 ring-white/60 ring-offset-2 ring-offset-[#050608] shadow-lg"
                      : "opacity-70 group-hover:opacity-100 group-hover:scale-105"
                  }`}
                  style={{ background: theme.color }}
                >
                  {isActive && (
                    <span className="text-sm font-bold text-white drop-shadow">✓</span>
                  )}
                  {isLight && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-300 text-[8px] leading-none text-yellow-900 shadow-sm">
                      ☀
                    </span>
                  )}
                </span>
                <span
                  className={`text-center text-[10px] font-medium leading-tight ${
                    isActive ? "text-slate-300" : "text-slate-600 group-hover:text-slate-400"
                  }`}
                >
                  {theme.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Display mode */}
      <div className="mb-8 border-t border-white/[0.06] pt-6">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Display mode
        </label>
        <p className="mb-3 text-xs text-slate-600">
          Light mode applies everywhere. The admin header stays dark for contrast.
        </p>
        <div className="flex gap-3">
          {(
            [
              { id: "dark" as AppMode, label: "Dark", icon: "🌙", preview: "bg-slate-900", textPreview: "text-white" },
              { id: "light" as AppMode, label: "Light", icon: "☀️", preview: "bg-white", textPreview: "text-slate-900" },
            ] as const
          ).map(({ id, label, icon, preview, textPreview }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleModeChange(id)}
              className={`flex-1 rounded-xl border-2 px-4 py-4 text-left transition-all ${
                mode === id
                  ? "border-teal-500/60 bg-teal-500/[0.07]"
                  : "border-white/[0.08] hover:border-white/[0.18]"
              }`}
            >
              <div className={`mb-2 flex h-10 w-full items-center justify-between rounded-lg px-3 ${preview}`}>
                <div className={`text-xs font-semibold ${textPreview}`}>Aa</div>
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  <span className="h-2 w-6 rounded-full bg-slate-400/40" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className={`text-sm font-medium ${mode === id ? "text-white" : "text-slate-400"}`}>
                  {label}
                </span>
                {mode === id && (
                  <span className="ml-auto text-xs font-semibold text-teal-400">Active</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

type MaintenanceResult = {
  expiredCache: number;
  expiredChallenges: number;
  expiredLoginTokens: number;
  expiredPasswordResets: number;
  oldUsageRecords: number;
};

function MaintenanceSection() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function runMaintenance() {
    setStatus("running");
    setResult(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/maintenance", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; deleted?: MaintenanceResult; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Maintenance failed");
        setStatus("error");
      } else {
        setResult(data.deleted ?? null);
        setStatus("done");
        timeoutRef.current = setTimeout(() => setStatus("idle"), 12000);
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    }
  }

  const tasks = [
    { label: "Expired SP-API response cache", key: "expiredCache" as const },
    { label: "Expired passkey challenges", key: "expiredChallenges" as const },
    { label: "Expired passkey login tokens", key: "expiredLoginTokens" as const },
    { label: "Expired password reset tokens", key: "expiredPasswordResets" as const },
    { label: "Usage records older than 12 months", key: "oldUsageRecords" as const },
  ];

  const totalDeleted = result ? Object.values(result).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)]">
      <h2 className="mb-1 text-base font-semibold text-white">Database Maintenance</h2>
      <p className="mb-6 text-sm text-slate-500">
        Cleans up expired records and compacts the database. Safe to run at any time — only
        removes rows that are no longer needed.
      </p>

      {/* Task list */}
      <ul className="mb-6 space-y-2">
        {tasks.map(({ label, key }) => (
          <li key={key} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
            <span className="text-[13px] text-slate-400">{label}</span>
            {status === "done" && result ? (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={
                  result[key] > 0
                    ? { background: "rgb(var(--accent) / 0.12)", color: "rgb(var(--accent))" }
                    : { background: "rgb(255 255 255 / 0.04)", color: "rgb(148 163 184)" }
                }
              >
                {result[key] > 0 ? `−${result[key]}` : "clean"}
              </span>
            ) : (
              <span className="h-5 w-14 animate-pulse rounded-full bg-white/[0.04]" style={status !== "running" ? { animation: "none", background: "transparent" } : {}} />
            )}
          </li>
        ))}
        <li className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
          <span className="text-[13px] text-slate-400">SQLite VACUUM (compact DB file)</span>
          {status === "done" ? (
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              done
            </span>
          ) : (
            <span className="h-5 w-14 rounded-full" style={{ background: "transparent" }} />
          )}
        </li>
      </ul>

      {/* Result banner */}
      {status === "done" && result && (
        <div
          className="mb-5 flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: "rgb(var(--accent) / 0.25)", background: "rgb(var(--accent) / 0.06)" }}
        >
          <span className="text-lg">✓</span>
          <p className="text-[13px] text-slate-300">
            Maintenance complete.{" "}
            <strong className="text-white">{totalDeleted} row{totalDeleted !== 1 ? "s" : ""}</strong>{" "}
            deleted and database compacted.
          </p>
        </div>
      )}

      {status === "error" && errorMsg && (
        <div className="mb-5 rounded-xl border border-rose-500/25 bg-rose-500/[0.07] px-4 py-3">
          <p className="text-[13px] text-rose-300">{errorMsg}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void runMaintenance()}
        disabled={status === "running" || status === "done"}
        className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "rgb(var(--accent))",
          boxShadow: "0 0 20px -4px rgb(var(--accent) / 0.4)",
        }}
      >
        {status === "running" ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            Running…
          </>
        ) : status === "done" ? (
          "Done ✓"
        ) : (
          "Run Maintenance"
        )}
      </button>
    </div>
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
          Manage admin panel security and app appearance preferences.
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

      <section>
        <AdminThemeSection />
      </section>

      <section>
        <MaintenanceSection />
      </section>
    </div>
  );
}
