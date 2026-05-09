"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnalysisPreferencesSection } from "./AnalysisPreferencesSection";
import { MarketplaceSection } from "./MarketplaceSection";
import { AppearanceSection } from "./AppearanceSection";
import { ExplorerColumnsSection } from "./ExplorerColumnsSection";

export type SettingsSection =
  | "analysis-preferences"
  | "marketplace"
  | "appearance"
  | "explorer-columns";

const SECTIONS: { id: SettingsSection; label: string; icon: string }[] = [
  { id: "analysis-preferences", label: "Analysis Preferences", icon: "📊" },
  { id: "marketplace", label: "Marketplace", icon: "🌍" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "explorer-columns", label: "Explorer Columns", icon: "🔧" },
];

function subscribeMobile(callback: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getIsMobileSnapshot(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function getIsMobileServerSnapshot(): boolean {
  return false;
}

function useIsMobileNav(): boolean {
  return useSyncExternalStore(subscribeMobile, getIsMobileSnapshot, getIsMobileServerSnapshot);
}

function SettingsSectionBody({
  id,
  showCardTitle,
}: {
  id: SettingsSection;
  showCardTitle: boolean;
}) {
  const titleClass = showCardTitle ? "text-lg font-semibold text-slate-900" : "sr-only";

  switch (id) {
    case "analysis-preferences":
      return (
        <>
          <h2 className={titleClass}>Analysis Preferences</h2>
          <AnalysisPreferencesSection className={showCardTitle ? "mt-4" : "mt-0"} />
        </>
      );
    case "marketplace":
      return (
        <>
          <h2 className={titleClass}>Marketplace</h2>
          <MarketplaceSection className={showCardTitle ? "mt-4" : "mt-0"} />
        </>
      );
    case "appearance":
      return (
        <>
          <h2 className={titleClass}>Appearance</h2>
          <AppearanceSection className={showCardTitle ? "mt-4" : "mt-0"} />
        </>
      );
    case "explorer-columns":
      return (
        <>
          <h2 className={titleClass}>Explorer Columns</h2>
          <ExplorerColumnsSection className={showCardTitle ? "mt-4" : "mt-0"} />
        </>
      );
    default:
      return null;
  }
}

function SettingsMobileSheet({
  section,
  label,
  onClose,
}: {
  section: SettingsSection;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col bg-white md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-sheet-title"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 min-w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Back to settings"
        >
          <span className="text-lg" aria-hidden>
            ←
          </span>
        </button>
        <h2 id="settings-sheet-title" className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">
          {label}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <SettingsSectionBody id={section} showCardTitle={false} />
        </div>
      </div>
    </div>
  );
}

export function SettingsContent() {
  const [section, setSection] = useState<SettingsSection>("analysis-preferences");
  const [sheet, setSheet] = useState<SettingsSection | null>(null);
  const isMobile = useIsMobileNav();

  const displaySheet = isMobile ? sheet : null;

  const sheetLabel = SECTIONS.find((s) => s.id === displaySheet)?.label ?? "Settings";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      {/* Mobile: compact home list → opens full-screen sheet */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:hidden">
        <nav className="px-4 pb-8 pt-2 sm:px-6" aria-label="Settings sections">
          <ul className="space-y-2">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setSheet(item.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-teal-300/60 hover:bg-teal-50/40 active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-xl leading-none" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="text-base font-semibold text-slate-900">{item.label}</span>
                  </span>
                  <span className="shrink-0 text-slate-400" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Desktop: sidebar + panel */}
      <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white/60 py-4 md:flex">
        <nav className="px-3" aria-label="Settings sections">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sections</p>
          <ul className="space-y-0.5">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    section === item.id
                      ? "border border-teal-500/30 bg-teal-500/15 text-teal-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="hidden min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-6 md:block">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
            <SettingsSectionBody id={section} showCardTitle />
          </div>
        </div>
      </div>

      {typeof document !== "undefined" && displaySheet
        ? createPortal(
            <SettingsMobileSheet
              section={displaySheet}
              label={sheetLabel}
              onClose={() => setSheet(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
