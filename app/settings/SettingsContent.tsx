"use client";

import { useState } from "react";
import { AnalysisPreferencesSection } from "./AnalysisPreferencesSection";
import { MarketplaceSection } from "./MarketplaceSection";

export type SettingsSection =
  | "analysis-preferences"
  | "marketplace"
  | "app-preferences";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "analysis-preferences", label: "Analysis Preferences" },
  { id: "marketplace", label: "Marketplace" },
  { id: "app-preferences", label: "App Preferences" },
];

export function SettingsContent() {
  const [section, setSection] = useState<SettingsSection>("analysis-preferences");

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-white/60 py-4">
        <nav className="px-3" aria-label="Settings sections">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Sections
          </p>
          <ul className="space-y-0.5">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    section === item.id
                      ? "bg-teal-500/15 text-teal-700 border border-teal-500/30"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-xl">
          {section === "analysis-preferences" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Analysis Preferences</h2>
              <AnalysisPreferencesSection className="mt-4" />
            </div>
          )}
          {section === "marketplace" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">Marketplace</h2>
              <MarketplaceSection className="mt-4" />
            </div>
          )}
          {section === "app-preferences" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <h2 className="text-lg font-semibold text-slate-900">App Preferences</h2>
              <p className="mt-4 text-sm text-slate-500">
                Catalog results per page and analysis defaults are in <strong>Analysis Preferences</strong>. More options here later.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
