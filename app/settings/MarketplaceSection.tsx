"use client";

import { useEffect, useState } from "react";
import { MARKETPLACE_IDS, MARKETPLACE_OPTIONS } from "@/lib/marketplaces";

export function MarketplaceSection({ className = "" }: { className?: string }) {
  const [marketplaceId, setMarketplaceId] = useState<string>(MARKETPLACE_IDS.USA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    fetch("/api/settings/preferences", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { marketplace_id?: string }) => {
        const id = data.marketplace_id?.trim();
        if (id && MARKETPLACE_OPTIONS.some((o) => o.value === id)) {
          setMarketplaceId(id);
        } else {
          setMarketplaceId(MARKETPLACE_IDS.USA);
        }
      })
      .catch(() => setMarketplaceId(MARKETPLACE_IDS.USA))
      .finally(() => setLoading(false));
  }, []);

  async function handleChange(value: string) {
    setMarketplaceId(value);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace_id: value }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("saved");
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage("error");
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={className}>
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm text-slate-600 mb-4">
        Choose the Amazon marketplace for catalog search and product data. Your selection is used when you are signed in.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="block">
          <span className="sr-only">Marketplace</span>
          <select
            value={marketplaceId}
            onChange={(e) => handleChange(e.target.value)}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
          >
            {MARKETPLACE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {message === "saved" && (
          <span className="text-sm text-teal-600">Saved.</span>
        )}
        {message === "error" && (
          <span className="text-sm text-red-600">Failed to save.</span>
        )}
      </div>
    </div>
  );
}
