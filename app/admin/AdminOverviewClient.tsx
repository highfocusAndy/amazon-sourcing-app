"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

// ── API response types ────────────────────────────────────────────────────────

type OverviewResponse = {
  ok: boolean;
  periodKey: string;
  metrics: {
    totalUsers: number;
    activeAccounts: number;
    trialUsers: number;
    promoAccessUsers: number;
    payingSubscriptions: number;
    starterPaying: number;
    proPaying: number;
    connectedAmazonAccounts: number;
    searchesMonthToDate: number;
    apiRequestsMonthToDate: number;
    estimatedMonthlyRevenueUsd: number;
    estimatesNote: string;
  };
  health: {
    database: string;
    spApiConfigured: boolean;
    openaiConfigured: boolean;
    imageSearchEnabled: boolean;
    keepaConfigured: boolean;
  };
};

type ChartResponse = {
  ok: boolean;
  signupsByDay: { date: string; count: number }[];
  planBreakdown: { name: string; value: number; color: string }[];
};

type TopUsersResponse = {
  ok: boolean;
  users: {
    userId: string;
    totalUsed: number;
    user: {
      email: string;
      name: string | null;
      subscriptionPlan: string;
      subscriptionStatus: string;
    } | null;
  }[];
};

type FlagResponse = {
  ok: boolean;
  flags: { key: string; label: string; description: string; enabled: boolean }[];
};

type FeedItem = {
  id: string;
  kind: string;
  at: string;
  title: string;
  detail?: string | null;
};

// ── Small UI primitives ───────────────────────────────────────────────────────

type MetricAccent = "neutral" | "teal" | "violet" | "amber" | "cyan" | "rose";

const accentColors: Record<MetricAccent, { top: string; badge: string }> = {
  neutral: { top: "from-white/20 via-white/5 to-transparent", badge: "text-slate-400" },
  teal: { top: "from-teal-400/50 via-teal-500/10 to-transparent", badge: "text-teal-400" },
  violet: { top: "from-violet-400/45 via-violet-500/10 to-transparent", badge: "text-violet-400" },
  amber: { top: "from-amber-400/40 via-amber-500/10 to-transparent", badge: "text-amber-400" },
  cyan: { top: "from-cyan-400/45 via-cyan-500/10 to-transparent", badge: "text-cyan-400" },
  rose: { top: "from-rose-400/40 via-rose-500/10 to-transparent", badge: "text-rose-400" },
};

function MetricCard({
  label,
  value,
  sub,
  accent = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: MetricAccent;
}) {
  const { top } = accentColors[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.055] via-[#0a0c12] to-[#07090e] px-4 py-4 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.03] transition duration-300 hover:border-teal-500/25">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${top} opacity-80 transition-opacity group-hover:opacity-100`}
        aria-hidden
      />
      <p className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="relative mt-2.5 text-[1.65rem] font-semibold leading-none tracking-tight text-white tabular-nums sm:text-[1.75rem]">
        {value}
      </p>
      {sub && <p className="relative mt-1.5 text-[11px] leading-snug text-slate-500">{sub}</p>}
    </div>
  );
}

type HealthTier = "operational" | "attention" | "idle";

const healthStyle: Record<HealthTier, { bar: string; text: string; subtle: string; row: string }> = {
  operational: {
    bar: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]",
    text: "Healthy",
    subtle: "text-emerald-200/95",
    row: "hover:border-emerald-500/15",
  },
  attention: {
    bar: "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.45)]",
    text: "Needs attention",
    subtle: "text-rose-200/95",
    row: "hover:border-rose-500/18",
  },
  idle: {
    bar: "bg-slate-500",
    text: "Not configured",
    subtle: "text-slate-500",
    row: "hover:border-white/[0.08]",
  },
};

function HealthRow({ label, tier }: { label: string; tier: HealthTier }) {
  const s = healthStyle[tier];
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition hover:bg-white/[0.035] ${s.row}`}>
      <span className="text-[13px] font-medium text-slate-300">{label}</span>
      <span className={`flex items-center gap-2.5 text-xs font-semibold ${s.subtle}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${s.bar}`} aria-hidden />
        {s.text}
      </span>
    </div>
  );
}

function PanelChrome({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[20px] bg-gradient-to-br from-teal-500/[0.12] via-white/[0.04] to-violet-500/[0.08] p-[1px] shadow-[0_24px_64px_-32px_rgba(0,0,0,0.75)] ${className}`}>
      <div className="h-full rounded-[19px] border border-white/[0.05] bg-[#090b11]/94 backdrop-blur-xl">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{children}</h2>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.04] ${className}`} />;
}

function feedAccent(kind: string): { stripe: string; pill: string; pillText: string } {
  switch (kind) {
    case "alert": return { stripe: "border-l-amber-400/70 bg-amber-500/[0.06]", pill: "border-amber-500/30 bg-amber-500/10 text-amber-100", pillText: "Alert" };
    case "promo": return { stripe: "border-l-cyan-400/70 bg-cyan-500/[0.04]", pill: "border-cyan-500/25 bg-cyan-500/10 text-cyan-100", pillText: "Promo" };
    case "signup": return { stripe: "border-l-teal-400/70 bg-teal-500/[0.04]", pill: "border-teal-500/25 bg-teal-500/10 text-teal-100", pillText: "Signup" };
    case "usage": return { stripe: "border-l-violet-400/55 bg-violet-500/[0.04]", pill: "border-violet-500/25 bg-violet-500/10 text-violet-100", pillText: "Usage" };
    default: return { stripe: "border-l-slate-500/50 bg-white/[0.02]", pill: "border-white/10 bg-white/[0.04] text-slate-300", pillText: kind || "Event" };
  }
}

const METRIC_COLORS: Record<string, string> = {
  analyze: "#14b8a6",
  analyze_offers: "#6366f1",
  catalog_search: "#f59e0b",
  keyword_search: "#8b5cf6",
  restrictions: "#ec4899",
  openai_insight: "#06b6d4",
  openai_chat: "#10b981",
};

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0f17]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      {label && <p className="mb-1 text-[11px] font-semibold text-slate-400">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-semibold text-white">
          {p.name && <span className="text-slate-400">{p.name}: </span>}
          {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminOverviewClient() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [charts, setCharts] = useState<ChartResponse | null>(null);
  const [topUsers, setTopUsers] = useState<TopUsersResponse | null>(null);
  const [flags, setFlags] = useState<FlagResponse | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/overview").then((r) => r.json() as Promise<OverviewResponse>),
      fetch("/api/admin/activity").then((r) => r.json()) as Promise<{ items: FeedItem[] }>,
      fetch("/api/admin/charts").then((r) => r.json() as Promise<ChartResponse>),
      fetch("/api/admin/top-users").then((r) => r.json() as Promise<TopUsersResponse>),
      fetch("/api/admin/feature-flags").then((r) => r.json() as Promise<FlagResponse>),
    ])
      .then(([o, a, c, tu, f]) => {
        setOverview(o?.ok ? o : null);
        setFeed(Array.isArray((a as { items?: FeedItem[] })?.items) ? (a as { items: FeedItem[] }).items : []);
        setCharts(c?.ok ? c : null);
        setTopUsers(tu?.ok ? tu : null);
        setFlags(f?.ok ? f : null);
      })
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  const toggleFlag = useCallback(async (key: string, enabled: boolean) => {
    setFlags((prev) =>
      prev
        ? { ...prev, flags: prev.flags.map((f) => (f.key === key ? { ...f, enabled } : f)) }
        : prev,
    );
    await fetch("/api/admin/feature-flags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    }).catch(() => {});
  }, []);

  const m = overview?.metrics;
  const h = overview?.health;

  // API usage breakdown data from overview metrics for a bar chart
  const usageBreakdown = m
    ? [
        { metric: "analyze", label: "Analysis", value: 0 },
        { metric: "analyze_offers", label: "Offers", value: 0 },
        { metric: "catalog_search", label: "Catalog", value: 0 },
        { metric: "keyword_search", label: "Keywords", value: 0 },
        { metric: "restrictions", label: "Restrictions", value: 0 },
      ]
    : [];

  return (
    <div className="space-y-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Console
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-medium text-slate-500">Internal operations</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[1.75rem]">
            Operations
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
            Live workspace telemetry — billing counters, quotas, and environment readiness.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-lg border border-white/[0.08] bg-[#0c0e14] px-2.5 py-1 font-mono text-[11px] tabular-nums text-teal-200/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              Period {overview?.periodKey ?? "—"}
            </span>
            <span className="text-xs text-slate-600">UTC · database-backed</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[108px]" />
            ))}
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : !m ? (
        <div className="rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-500/[0.08] to-transparent px-6 py-16 text-center">
          <p className="text-sm font-medium text-rose-100">Could not load overview.</p>
          <p className="mt-2 text-xs text-rose-200/55">Check admin access and try again.</p>
        </div>
      ) : (
        <>
          {/* ── Key metrics grid ──────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Key metrics</SectionLabel>
              <span className="text-[10px] text-slate-600">Month-to-date where noted</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="Total users" value={m.totalUsers} accent="neutral" />
              <MetricCard
                label="Active accounts"
                value={m.activeAccounts}
                sub="Stripe, trial, or promo"
                accent="teal"
              />
              <MetricCard
                label="Paying Stripe seats"
                value={m.payingSubscriptions}
                sub={`Starter ${m.starterPaying} · Pro ${m.proPaying}`}
                accent="violet"
              />
              <MetricCard
                label="Est. MRR (USD)"
                value={`≈ $${m.estimatedMonthlyRevenueUsd.toLocaleString()}`}
                sub="Based on plan prices"
                accent="teal"
              />
              <MetricCard label="Trial windows" value={m.trialUsers} accent="amber" />
              <MetricCard label="Promo access" value={m.promoAccessUsers} accent="cyan" />
              <MetricCard label="Linked Amazon OAuth" value={m.connectedAmazonAccounts} accent="teal" />
              <MetricCard
                label="API requests (mtd)"
                value={m.apiRequestsMonthToDate.toLocaleString()}
                sub="All metered endpoints"
                accent="neutral"
              />
            </div>
          </section>

          {/* ── Charts row ───────────────────────────────────────────────── */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* User growth bar chart */}
            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>New signups — last 30 days</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">Daily user registrations</p>
                <div className="mt-5 h-[220px]">
                  {charts?.signupsByDay ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.signupsByDay} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "#475569" }}
                          tickFormatter={(v: string) => v.slice(5)}
                          interval={4}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#475569" }}
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {charts.signupsByDay.map((_, i) => (
                            <Cell key={i} fill={i === charts.signupsByDay.length - 1 ? "#2dd4bf" : "#14b8a680"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Skeleton className="h-full" />
                  )}
                </div>
              </div>
            </PanelChrome>

            {/* Plan breakdown donut */}
            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>Plan breakdown</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">Subscribers by tier</p>
                <div className="mt-4 h-[220px]">
                  {charts?.planBreakdown ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={charts.planBreakdown}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {charts.planBreakdown.map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value: string) => (
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Skeleton className="h-full" />
                  )}
                </div>
              </div>
            </PanelChrome>
          </section>

          {/* ── API usage breakdown + top users ──────────────────────────── */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* API usage breakdown */}
            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>API usage this month</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">Metered endpoint calls month-to-date</p>
                <div className="mt-5 space-y-2.5">
                  {usageBreakdown.length > 0 ? (
                    [
                      { key: "analyze", label: "Product Analysis", color: METRIC_COLORS.analyze },
                      { key: "analyze_offers", label: "Offers Lookup", color: METRIC_COLORS.analyze_offers },
                      { key: "catalog_search", label: "Catalog Search", color: METRIC_COLORS.catalog_search },
                      { key: "keyword_search", label: "Keyword Search", color: METRIC_COLORS.keyword_search },
                      { key: "restrictions", label: "Restrictions Check", color: METRIC_COLORS.restrictions },
                      { key: "openai_insight", label: "AI Insight", color: METRIC_COLORS.openai_insight },
                      { key: "openai_chat", label: "AI Chat", color: METRIC_COLORS.openai_chat },
                    ].map(({ key, label, color }) => {
                      const v = 0; // individual breakdown not in overview; show totals note
                      void v; void key;
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                          <span className="flex-1 text-[13px] text-slate-300">{label}</span>
                          <span className="font-mono text-[12px] text-slate-500">—</span>
                        </div>
                      );
                    })
                  ) : null}
                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-center">
                    <p className="text-[11px] font-semibold text-teal-300">
                      {m.apiRequestsMonthToDate.toLocaleString()} total requests
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {m.searchesMonthToDate.toLocaleString()} catalog + keyword searches
                    </p>
                  </div>
                </div>
              </div>
            </PanelChrome>

            {/* Top active users */}
            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>Top active users this month</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">Ranked by total API calls</p>
                <ul className="mt-5 space-y-2">
                  {topUsers?.users && topUsers.users.length > 0 ? (
                    topUsers.users.slice(0, 8).map((u, i) => (
                      <li
                        key={u.userId}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                      >
                        <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-600">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-slate-200">
                            {u.user?.email ?? u.userId}
                          </p>
                          <p className="text-[10px] text-slate-600 capitalize">
                            {u.user?.subscriptionPlan ?? "—"} · {u.user?.subscriptionStatus ?? "—"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md border border-teal-500/25 bg-teal-500/8 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-300">
                          {u.totalUsed}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="rounded-xl border border-dashed border-white/[0.06] py-8 text-center text-xs text-slate-600">
                      No usage data this period
                    </li>
                  )}
                </ul>
              </div>
            </PanelChrome>
          </section>

          {/* ── System signals + activity stream ─────────────────────────── */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>System signals</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">
                  Lightweight environment checks — pair with external uptime for production SLA.
                </p>
                <div className="mt-5 space-y-2.5">
                  <HealthRow label="Database" tier={h?.database === "ok" ? "operational" : "attention"} />
                  <HealthRow label="SP-API configuration" tier={h?.spApiConfigured ? "operational" : "attention"} />
                  <HealthRow label="OpenAI vision (image scans)" tier={h?.imageSearchEnabled ? "operational" : "idle"} />
                  <HealthRow label="Keepa API token" tier={h?.keepaConfigured ? "operational" : "idle"} />
                </div>
              </div>
            </PanelChrome>

            <PanelChrome>
              <div className="p-5 sm:p-6">
                <SectionLabel>Activity stream</SectionLabel>
                <p className="mt-1.5 text-xs text-slate-600">
                  Onboarding, redemptions, quota motion, and internal alerts.
                </p>
                <ul className="mt-5 max-h-[380px] space-y-2 overflow-y-auto pr-1">
                  {feed.slice(0, 24).map((ev) => {
                    const a = feedAccent(ev.kind);
                    return (
                      <li
                        key={ev.id}
                        className={`rounded-xl border border-white/[0.06] border-l-[3px] px-3 py-2.5 text-xs transition hover:border-white/[0.1] hover:bg-white/[0.02] ${a.stripe}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${a.pill}`}>
                                {a.pillText}
                              </span>
                              <span className="font-semibold leading-snug text-slate-100">{ev.title}</span>
                            </div>
                            {ev.detail && (
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{ev.detail}</p>
                            )}
                          </div>
                          <time className="shrink-0 pt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                            {new Date(ev.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                  {feed.length === 0 && (
                    <li className="rounded-xl border border-dashed border-white/[0.08] py-10 text-center text-xs text-slate-600">
                      No recent feed items.
                    </li>
                  )}
                </ul>
              </div>
            </PanelChrome>
          </section>

          {/* ── Feature flags ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Feature flags</SectionLabel>
              <span className="text-[10px] text-slate-600">Stored in SystemConfig · changes apply on next request</span>
            </div>
            <PanelChrome>
              <div className="p-5 sm:p-6">
                {flags ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {flags.flags.map((flag) => (
                      <div
                        key={flag.key}
                        className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
                          flag.enabled
                            ? "border-teal-500/25 bg-teal-500/[0.06]"
                            : "border-white/[0.06] bg-white/[0.02]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className={`text-[13px] font-semibold ${flag.enabled ? "text-teal-100" : "text-slate-400"}`}>
                            {flag.label}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{flag.description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={flag.enabled}
                          onClick={() => void toggleFlag(flag.key, !flag.enabled)}
                          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${
                            flag.enabled ? "bg-teal-500" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                              flag.enabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Skeleton className="h-32" />
                )}
              </div>
            </PanelChrome>
          </section>

          {/* ── Revenue summary ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionLabel>Revenue snapshot</SectionLabel>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard
                label="Starter subscribers"
                value={m.starterPaying}
                sub={`≈ $${(m.starterPaying * (Number(process?.env?.NEXT_PUBLIC_STARTER_PRICE) || 29)).toLocaleString()}/mo est.`}
                accent="teal"
              />
              <MetricCard
                label="Pro subscribers"
                value={m.proPaying}
                sub={`≈ $${(m.proPaying * (Number(process?.env?.NEXT_PUBLIC_PRO_PRICE) || 79)).toLocaleString()}/mo est.`}
                accent="violet"
              />
              <MetricCard
                label="Est. total MRR"
                value={`≈ $${m.estimatedMonthlyRevenueUsd.toLocaleString()}`}
                sub={m.estimatesNote}
                accent="amber"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
