"use client";

import { useEffect, useState } from "react";

type UsageUser = {
  userId: string;
  email: string;
  name: string | null;
  metrics: Record<string, { used: number; limit: number | null }>;
};

const METRICS = ["analyze", "analyze_offers", "catalog_search", "keyword_search", "restrictions"];

function pct(used: number, limit: number | null): number | null {
  if (!limit) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function prevPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.035] to-transparent px-4 py-3 shadow-[0_14px_40px_-28px_rgba(0,0,0,0.9)] transition hover:border-teal-500/20 hover:shadow-[0_20px_50px_-24px_rgba(13,148,136,0.18)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white tabular-nums">{value}</p>
    </div>
  );
}

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageUser[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/admin/usage?period=${period}`);
        const d = (await r.json()) as { users: UsageUser[] };
        if (!cancelled) setData(d.users ?? []);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalByMetric = METRICS.reduce<Record<string, number>>((acc, m) => {
    acc[m] = data.reduce((s, u) => s + (u.metrics[m]?.used ?? 0), 0);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Usage</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Aggregated metering for <span className="font-mono text-slate-400">{period}</span>
            {" · "}
            <span className="tabular-nums">{data.length}</span> users with counters this period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod(prevPeriod())}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${period === prevPeriod() ? "border-teal-500/55 bg-teal-500/[0.12] text-teal-100 shadow-[0_16px_40px_-24px_rgba(13,148,136,0.45)]" : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"}`}
          >
            {prevPeriod()}
          </button>
          <button
            type="button"
            onClick={() => setPeriod(currentPeriod())}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${period === currentPeriod() ? "border-teal-500/55 bg-teal-500/[0.12] text-teal-100 shadow-[0_16px_40px_-24px_rgba(13,148,136,0.45)]" : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"}`}
          >
            {currentPeriod()}
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-200/90">Current</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m) => (
          <SummaryTile key={m} label={m.replace(/_/g, " ")} value={totalByMetric[m] ?? 0} />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-[#080a0f]/50 py-28 text-sm text-slate-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur">
          Loading usage…
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-[#080a0f]/50 py-28 text-sm text-slate-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur">
          No usage recorded for this period.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#080a0f]/80 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)] backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] [&_button]:leading-tight">
                <tr className="font-semibold text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-4 py-3">User</th>
                  {METRICS.map((m) => (
                    <th key={m} className="whitespace-nowrap px-4 py-3">
                      {m.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
              {data.map((u) => (
                <tr key={u.userId} className="transition-colors hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-100">{u.email}</p>
                    {u.name ? <p className="text-xs text-slate-600">{u.name}</p> : null}
                  </td>
                  {METRICS.map((m) => {
                    const metric = u.metrics[m];
                    const used = metric?.used ?? 0;
                    const limit = metric?.limit ?? null;
                    const p = pct(used, limit);
                    return (
                      <td key={m} className="px-4 py-3">
                        {used > 0 ? (
                          <div>
                            <span
                              className={`font-semibold tabular-nums ${p !== null && p >= 90 ? "text-rose-300" : p !== null && p >= 70 ? "text-amber-200" : "text-slate-200"}`}
                            >
                              {used}
                            </span>
                            {limit !== null ? <span className="tabular-nums text-slate-500">/{limit}</span> : null}
                            {p !== null ? (
                              <div className="mt-1.5 h-1 max-w-[4.25rem] overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className={`h-1 rounded-full ${p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-amber-500" : "bg-teal-500/90"}`}
                                  style={{ width: `${p}%` }}
                                />
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
