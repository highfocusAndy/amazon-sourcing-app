"use client";

import { useEffect, useState } from "react";
import type { UsageSummaryRow, PlanTier } from "@/lib/usageQuota";

type Summary = {
  tier: PlanTier;
  periodKey: string;
  rows: UsageSummaryRow[];
  unlimited: boolean;
};

function tierLabel(tier: PlanTier): string {
  if (tier === "owner_unlimited") return "Owner (unlimited)";
  if (tier === "pro") return "Pro";
  if (tier === "starter") return "Starter";
  return "Trial";
}

function UsageBar({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null || limit === 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-400" : "bg-teal-500";
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function UsageSection({ className }: { className?: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: Summary) => setSummary(data))
      .catch(() => setError("Could not load usage data."));
  }, []);

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className={className}>
      {error ? (
        <p className="text-sm text-rose-500">{error}</p>
      ) : !summary ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : summary.unlimited ? (
        <p className="text-sm text-slate-600">Unlimited access — no quotas apply to your account.</p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{monthName}</span>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
              {tierLabel(summary.tier)} plan
            </span>
          </div>
          <ul className="space-y-4">
            {summary.rows.map((row) => (
              <li key={row.metric}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-slate-700">{row.label}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {row.used.toLocaleString()}
                    {row.limit !== null ? ` / ${row.limit.toLocaleString()}` : ""}
                    {row.limit !== null && row.limit > 0
                      ? ` (${Math.max(0, row.limit - row.used).toLocaleString()} left)`
                      : ""}
                  </span>
                </div>
                <UsageBar used={row.used} limit={row.limit} />
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-slate-400">Resets on the 1st of each month (UTC).</p>
        </>
      )}
    </div>
  );
}
