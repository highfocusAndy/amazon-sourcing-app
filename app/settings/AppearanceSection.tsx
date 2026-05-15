"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  type ThemeId,
  DEFAULT_THEME_ID,
  THEME_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  MODE_STORAGE_KEY,
  DEFAULT_MODE,
  type AppMode,
  type TableDensity,
  applyTheme,
  applyDensity,
  applyMode,
  persistAppearanceCookies,
} from "@/lib/theme";

export function AppearanceSection({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<AppMode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    return (localStorage.getItem(MODE_STORAGE_KEY) as AppMode | null) ?? DEFAULT_MODE;
  });
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    return saved && THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME_ID;
  });
  const [density, setDensity] = useState<TableDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY) as TableDensity | null;
    return saved === "comfortable" || saved === "compact" ? saved : "comfortable";
  });

  useEffect(() => {
    persistAppearanceCookies();
  }, []);

  function handleModeChange(m: AppMode) {
    setMode(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
    persistAppearanceCookies();
    document.documentElement.classList.add("theme-switching");
    setTimeout(() => document.documentElement.classList.remove("theme-switching"), 450);
    applyMode(m);
  }

  function handleThemeChange(id: ThemeId) {
    const theme = THEMES.find((t) => t.id === id);
    setActiveTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    applyTheme(id, true); // animate=true → smooth transition only on manual switch
    // Keep mode state + storage in sync with what this theme prefers
    if (theme) {
      const themeMode = theme.mode as AppMode;
      setMode(themeMode);
      localStorage.setItem(MODE_STORAGE_KEY, themeMode);
    }
    persistAppearanceCookies();
  }

  function handleDensityChange(d: TableDensity) {
    setDensity(d);
    localStorage.setItem(DENSITY_STORAGE_KEY, d);
    applyDensity(d);
    persistAppearanceCookies();
  }

  return (
    <div className={className}>
      <p className="mb-6 text-sm text-slate-600">
        Changes apply instantly — no page reload needed.
      </p>

      {/* ── Theme picker ──────────────────────────────── */}
      <div className="mb-8">
        <label className="mb-1 block text-sm font-semibold text-slate-800">
          Theme
        </label>
        <p className="mb-4 text-xs text-slate-500">
          Each theme sets the accent colour, background, sidebar, and display mode together.{" "}
          <strong className="text-slate-600">Light Clean</strong> switches to light mode automatically.
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
                  className={`relative flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all duration-150 ${
                    isActive
                      ? "scale-110 ring-2 ring-offset-2 ring-slate-400 shadow-lg"
                      : "opacity-75 group-hover:opacity-100 group-hover:scale-105"
                  }`}
                  style={{ background: theme.color }}
                >
                  {isActive && (
                    <span className="text-sm font-bold text-white drop-shadow">✓</span>
                  )}
                  {isLight && !isActive && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-300 text-[8px] leading-none text-yellow-900 shadow-sm">
                      ☀
                    </span>
                  )}
                  {isLight && isActive && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-300 text-[8px] leading-none text-yellow-900 shadow-sm">
                      ☀
                    </span>
                  )}
                </span>
                <span
                  className={`text-center text-[10px] font-medium leading-tight ${
                    isActive ? "text-slate-800" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  {theme.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Display mode ──────────────────────────────── */}
      <div className="mb-8 border-t border-slate-200 pt-6">
        <label className="mb-1 block text-sm font-semibold text-slate-800">
          Display mode
        </label>
        <p className="mb-3 text-xs text-slate-500">
          Override the mode for any theme. Light mode inverts the content area; the sidebar stays dark.
        </p>
        <div className="flex gap-3">
          {(
            [
              {
                id: "dark" as AppMode,
                label: "Dark",
                preview: "bg-slate-900",
                textPreview: "text-white",
                icon: "🌙",
              },
              {
                id: "light" as AppMode,
                label: "Light",
                preview: "bg-white border border-slate-200",
                textPreview: "text-slate-900",
                icon: "☀️",
              },
            ] as const
          ).map(({ id, label, preview, textPreview, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleModeChange(id)}
              className={`flex-1 rounded-xl border-2 px-4 py-4 text-left transition-all ${
                mode === id
                  ? "border-teal-500 shadow-sm"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div
                className={`mb-2 flex h-10 w-full items-center justify-between rounded-lg px-3 ${preview}`}
              >
                <div className={`text-xs font-semibold ${textPreview}`}>Aa</div>
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  <span className="h-2 w-6 rounded-full bg-slate-400/40" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span
                  className={`text-sm font-medium ${
                    mode === id ? "text-slate-900" : "text-slate-600"
                  }`}
                >
                  {label}
                </span>
                {mode === id && (
                  <span className="ml-auto text-xs font-semibold text-teal-600">Active</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Table density ──────────────────────────────── */}
      <div className="border-t border-slate-200 pt-6">
        <label className="mb-1 block text-sm font-semibold text-slate-800">
          Table density
        </label>
        <p className="mb-3 text-xs text-slate-500">
          Controls row height in product tables.
        </p>
        <div className="flex gap-3">
          {(
            [
              { id: "comfortable" as TableDensity, label: "Comfortable", desc: "Standard row height." },
              { id: "compact" as TableDensity, label: "Compact", desc: "More products visible." },
            ]
          ).map(({ id, label, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleDensityChange(id)}
              className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                density === id
                  ? "border-teal-500/60 bg-teal-500/8 text-slate-800 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="block font-medium">{label}</span>
              <span className="text-xs text-slate-500">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
