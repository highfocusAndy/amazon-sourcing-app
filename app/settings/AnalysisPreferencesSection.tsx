"use client";

import { useEffect, useState } from "react";
import { normalizeCompetitionThresholds } from "@/lib/competitionThresholds";
import { COMPETITION_THRESHOLDS_CHANGED_EVENT } from "@/app/context/CompetitionThresholdsContext";

export type PreferencesData = {
  default_seller_type: "FBA" | "FBM";
  default_shipping_cost_fbm: number;
  catalog_page_size: number;
  competition_low_max_offers: number;
  competition_moderate_max_offers: number;
  competition_saturated_min_offers: number;
};

const compNormalized = normalizeCompetitionThresholds(null);

const DEFAULT_PREFS: PreferencesData = {
  default_seller_type: "FBA",
  default_shipping_cost_fbm: 0,
  catalog_page_size: 30,
  competition_low_max_offers: compNormalized.lowMaxOffers,
  competition_moderate_max_offers: compNormalized.moderateMaxOffers,
  competition_saturated_min_offers: compNormalized.saturatedMinOffers,
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
      .then((data: Record<string, unknown>) => {
        const comp = normalizeCompetitionThresholds({
          lowMaxOffers: typeof data.competition_low_max_offers === "number" ? data.competition_low_max_offers : undefined,
          moderateMaxOffers:
            typeof data.competition_moderate_max_offers === "number"
              ? data.competition_moderate_max_offers
              : undefined,
          saturatedMinOffers:
            typeof data.competition_saturated_min_offers === "number"
              ? data.competition_saturated_min_offers
              : undefined,
        });

        setPrefs({
          default_seller_type:
            data.default_seller_type === "FBM" || data.default_seller_type === "FBA"
              ? data.default_seller_type
              : DEFAULT_PREFS.default_seller_type,
          default_shipping_cost_fbm:
            typeof data.default_shipping_cost_fbm === "number"
              ? data.default_shipping_cost_fbm
              : DEFAULT_PREFS.default_shipping_cost_fbm,
          catalog_page_size:
            typeof data.catalog_page_size === "number"
              ? data.catalog_page_size
              : DEFAULT_PREFS.catalog_page_size,
          competition_low_max_offers: comp.lowMaxOffers,
          competition_moderate_max_offers: comp.moderateMaxOffers,
          competition_saturated_min_offers: comp.saturatedMinOffers,
        });
      })
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));
  }, []);

  async function save(values: PreferencesData) {
    const compSafe = normalizeCompetitionThresholds({
      lowMaxOffers: values.competition_low_max_offers,
      moderateMaxOffers: values.competition_moderate_max_offers,
      saturatedMinOffers: values.competition_saturated_min_offers,
    });
    const nextPrefs: PreferencesData = {
      ...values,
      competition_low_max_offers: compSafe.lowMaxOffers,
      competition_moderate_max_offers: compSafe.moderateMaxOffers,
      competition_saturated_min_offers: compSafe.saturatedMinOffers,
    };

    setSaving(true);
    setMessage(null);
    setErrorText(null);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_seller_type: nextPrefs.default_seller_type,
          default_shipping_cost_fbm: nextPrefs.default_shipping_cost_fbm,
          catalog_page_size: nextPrefs.catalog_page_size,
          competition_low_max_offers: nextPrefs.competition_low_max_offers,
          competition_moderate_max_offers: nextPrefs.competition_moderate_max_offers,
          competition_saturated_min_offers: nextPrefs.competition_saturated_min_offers,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPrefs(nextPrefs);
      setMessage("saved");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(COMPETITION_THRESHOLDS_CHANGED_EVENT));
      }
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
                  Math.min(100, parseInt(e.target.value, 10) || 30),
                ),
              })
            }
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
          <p className="mt-1 text-xs text-slate-500">Between 10 and 100.</p>
        </div>

        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Seller competition (offer counts)</legend>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Tune how many sellers on structured offer data maps to{" "}
            <span className="font-medium text-slate-800">low</span>,{" "}
            <span className="font-medium text-slate-800">moderate</span>, or{" "}
            <span className="font-medium text-slate-800">highly saturated</span> in Explorer / Analyzer summaries and
            risk hints. Bands are saved with your account and applied on the dashboard after you hit Save.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Low competition (≤ offers)
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={prefs.competition_low_max_offers}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    competition_low_max_offers: parseInt(e.target.value, 10) || 1,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">At most this count = shallow offer map.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Moderate ceiling (≤ offers)
              </label>
              <input
                type="number"
                min={2}
                max={100}
                value={prefs.competition_moderate_max_offers}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    competition_moderate_max_offers: parseInt(e.target.value, 10) || 2,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">Above low, up through here = moderate.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Highly saturated (≥ offers)
              </label>
              <input
                type="number"
                min={4}
                max={200}
                value={prefs.competition_saturated_min_offers}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    competition_saturated_min_offers: parseInt(e.target.value, 10) || 4,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <p className="mt-1 text-[11px] text-slate-500">This count or more = saturation / strongest flags.</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">
            If numbers overlap, Save will coerce them into a valid order (low &lt; moderate &lt; saturated).
          </p>
        </fieldset>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message === "saved" && <span className="text-sm text-teal-600">Saved.</span>}
        {message === "error" && errorText && (
          <span className="text-sm text-red-600" title={errorText}>
            {errorText}
          </span>
        )}
      </div>
    </form>
  );
}
