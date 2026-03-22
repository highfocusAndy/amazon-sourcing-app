"use client";

import { useEffect, useState } from "react";

export type PreferencesData = {
  default_seller_type: "FBA" | "FBM";
  default_shipping_cost_fbm: number;
  catalog_page_size: number;
};

const DEFAULT_PREFS: PreferencesData = {
  default_seller_type: "FBA",
  default_shipping_cost_fbm: 0,
  catalog_page_size: 30,
};

export function AnalysisPreferencesSection({ className = "" }: { className?: string }) {
  const [prefs, setPrefs] = useState<PreferencesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/preferences", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: PreferencesData) => {
        setPrefs({
          default_seller_type: data.default_seller_type ?? DEFAULT_PREFS.default_seller_type,
          default_shipping_cost_fbm:
            typeof data.default_shipping_cost_fbm === "number"
              ? data.default_shipping_cost_fbm
              : DEFAULT_PREFS.default_shipping_cost_fbm,
          catalog_page_size:
            typeof data.catalog_page_size === "number"
              ? data.catalog_page_size
              : DEFAULT_PREFS.catalog_page_size,
        });
      })
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));
  }, []);

  async function save(values: PreferencesData) {
    setSaving(true);
    setMessage(null);
    setErrorText(null);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_seller_type: values.default_seller_type,
          default_shipping_cost_fbm: values.default_shipping_cost_fbm,
          catalog_page_size: values.catalog_page_size,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPrefs(values);
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    save(prefs);
  }

  if (loading || !prefs) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <p className="text-sm text-slate-600 mb-4">
        Defaults used when analyzing products in Explorer and Analyzer. You can still change them per product.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1">Default seller type</label>
          <select
            value={prefs.default_seller_type}
            onChange={(e) =>
              setPrefs({ ...prefs, default_seller_type: e.target.value as "FBA" | "FBM" })
            }
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          >
            <option value="FBA">FBA</option>
            <option value="FBM">FBM</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1">
            Default FBM shipping cost ($)
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={prefs.default_shipping_cost_fbm}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                default_shipping_cost_fbm: Math.max(0, parseFloat(e.target.value) || 0),
              })
            }
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800 mb-1">
            Catalog results per page (Explorer &amp; search)
          </label>
          <input
            type="number"
            min={10}
            max={100}
            value={prefs.catalog_page_size}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                catalog_page_size: Math.max(
                  10,
                  Math.min(100, parseInt(e.target.value, 10) || 30)
                ),
              })
            }
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
          <p className="mt-1 text-xs text-slate-500">Between 10 and 100.</p>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message === "saved" && (
          <span className="text-sm text-teal-600">Saved.</span>
        )}
        {message === "error" && errorText && (
          <span className="text-sm text-red-600" title={errorText}>
            {errorText}
          </span>
        )}
      </div>
    </form>
  );
}
