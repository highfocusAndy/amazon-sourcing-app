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

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageUser[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/admin/usage?period=${period}`)
      .then((r) => r.json())
      .then((d: { users: UsageUser[] }) => { setData(d.users ?? []); setLoading(false); });
  }, [period]);

  const totalByMetric = METRICS.reduce<Record<string, number>>((acc, m) => {
    acc[m] = data.reduce((s, u) => s + (u.metrics[m]?.used ?? 0), 0);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Usage</h1>
          <p className="mt-0.5 text-sm text-slate-400">{data.length} active users this period</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod(prevPeriod())}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${period === prevPeriod() ? "border-teal-500 bg-teal-500/20 text-teal-300" : "border-slate-600 text-slate-400 hover:bg-slate-700"}`}
          >
            {prevPeriod()}
          </button>
          <button
            type="button"
            onClick={() => setPeriod(currentPeriod())}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${period === currentPeriod() ? "border-teal-500 bg-teal-500/20 text-teal-300" : "border-slate-600 text-slate-400 hover:bg-slate-700"}`}
          >
            {currentPeriod()} (current)
          </button>
        </div>
      </div>

      {/* Summary totals */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m) => (
          <div key={m} className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{m.replace(/_/g, " ")}</p>
            <p className="mt-1 text-2xl font-bold text-teal-400">{totalByMetric[m] ?? 0}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-500">No usage recorded for this period.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700 bg-slate-800/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3">User</th>
                {METRICS.map((m) => (
                  <th key={m} className="px-4 py-3">{m.replace(/_/g, " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {data.map((u) => (
                <tr key={u.userId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{u.email}</p>
                    {u.name && <p className="text-xs text-slate-500">{u.name}</p>}
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
                            <span className={`font-semibold ${p !== null && p >= 90 ? "text-rose-400" : p !== null && p >= 70 ? "text-yellow-400" : "text-slate-200"}`}>
                              {used}
                            </span>
                            {limit !== null && <span className="text-slate-500">/{limit}</span>}
                            {p !== null && (
                              <div className="mt-1 h-1 w-16 rounded-full bg-slate-700">
                                <div
                                  className={`h-1 rounded-full ${p >= 90 ? "bg-rose-500" : p >= 70 ? "bg-yellow-500" : "bg-teal-500"}`}
                                  style={{ width: `${p}%` }}
                                />
                              </div>
                            )}
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
      )}
    </div>
  );
}
