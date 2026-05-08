"use client";

import { useEffect, useState } from "react";

type FiltersData = {
  show_keyword: boolean;
  show_sort: boolean;
  show_bsr: boolean;
  show_min_roi: boolean;
  show_min_profit: boolean;
  show_fba_fbm: boolean;
  show_restriction: boolean;
  show_price_range: boolean;
};

const DEFAULTS: FiltersData = {
  show_keyword: true,
  show_sort: true,
  show_bsr: true,
  show_min_roi: false,
  show_min_profit: false,
  show_fba_fbm: false,
  show_restriction: false,
  show_price_range: false,
};

const FILTER_LABELS: { key: keyof FiltersData; label: string; desc: string }[] = [
  { key: "show_keyword", label: "Keyword search", desc: "Search bar for filtering products by keyword" },
  { key: "show_sort", label: "Sort controls", desc: "Dropdown to choose sort order (price, rank, ROI…)" },
  { key: "show_bsr", label: "BSR filter", desc: "Filter by Best Seller Rank range" },
  { key: "show_min_roi", label: "Min ROI filter", desc: "Hide products below a minimum ROI %" },
  { key: "show_min_profit", label: "Min profit filter", desc: "Hide products below a minimum profit ($)" },
  { key: "show_fba_fbm", label: "FBA / FBM toggle", desc: "Switch between FBA and FBM calculation" },
  { key: "show_restriction", label: "Restriction filter", desc: "Filter by listing restriction status" },
  { key: "show_price_range", label: "Price range filter", desc: "Narrow results by buy / sell price range" },
];

export function ExplorerColumnsSection({ className = "" }: { className?: string }) {
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/explorer-filters", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: FiltersData) => setFilters({ ...DEFAULTS, ...data }))
      .catch(() => setFilters(DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  async function save(values: FiltersData) {
    setSaving(true);
    setMessage(null);
    setErrorText(null);
    try {
      const res = await fetch("/api/settings/explorer-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setFilters(values);
      setMessage("saved");
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setMessage("error");
      setErrorText(err instanceof Error ? err.message : "Save failed");
      setTimeout(() => {
        setMessage(null);
        setErrorText(null);
      }, 4000);
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof FiltersData) {
    if (!filters) return;
    setFilters({ ...filters, [key]: !filters[key] });
  }

  if (loading || !filters) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600 mb-5">
        Choose which filter controls appear above the product table in the Explorer. Hiding unused
        filters keeps the interface clean.
      </p>
      <div className="space-y-3">
        {FILTER_LABELS.map(({ key, label, desc }) => (
          <label
            key={key}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:bg-slate-50"
          >
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={filters[key]}
                onChange={() => toggle(key)}
              />
              <div
                className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                  filters[key]
                    ? "border-teal-500 bg-teal-500"
                    : "border-slate-300 bg-white"
                }`}
              >
                {filters[key] && (
                  <span className="text-[11px] font-bold text-white leading-none">✓</span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => save(filters)}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message === "saved" && (
          <span className="text-sm text-teal-600">Saved.</span>
        )}
        {message === "error" && errorText && (
          <span className="text-sm text-red-600">{errorText}</span>
        )}
      </div>
    </div>
  );
}
