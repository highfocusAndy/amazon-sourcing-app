"use client";

import { useEffect, useState, type ReactNode } from "react";

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
    railwayDetected: boolean;
    openaiConfigured: boolean;
    imageSearchEnabled: boolean;
    keepaConfigured: boolean;
  };
};

type FeedItem = {
  id: string;
  kind: string;
  at: string;
  title: string;
  detail?: string | null;
};

type MetricAccent = "neutral" | "teal" | "violet" | "amber" | "cyan";

const accentTop: Record<MetricAccent, string> = {
  neutral: "from-white/25 via-white/5 to-transparent",
  teal: "from-teal-400/50 via-teal-500/10 to-transparent",
  violet: "from-violet-400/45 via-violet-500/10 to-transparent",
  amber: "from-amber-400/40 via-amber-500/10 to-transparent",
  cyan: "from-cyan-400/45 via-cyan-500/10 to-transparent",
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
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.055] via-[#0a0c12] to-[#07090e] px-4 py-3.5 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.03] transition duration-300 hover:border-teal-500/25 hover:shadow-[0_28px_64px_-28px_rgba(13,148,136,0.22),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${accentTop[accent]} opacity-80 transition-opacity group-hover:opacity-100`}
        aria-hidden
      />
      <p className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="relative mt-2.5 text-[1.65rem] font-semibold leading-none tracking-tight text-white tabular-nums sm:text-[1.75rem]">
        {value}
      </p>
      {sub ? <p className="relative mt-1.5 text-[11px] leading-snug text-slate-500">{sub}</p> : null}
    </div>
  );
}

function HealthRow({
  label,
  tier,
}: {
  label: string;
  tier: "operational" | "attention" | "idle";
}) {
  const styles =
    tier === "operational"
      ? {
          bar: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]",
          text: "Healthy",
          subtle: "text-emerald-200/95",
          row: "hover:border-emerald-500/15",
        }
      : tier === "attention"
        ? {
            bar: "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.45)]",
            text: "Needs attention",
            subtle: "text-rose-200/95",
            row: "hover:border-rose-500/18",
          }
        : {
            bar: "bg-slate-500",
            text: "Idle",
            subtle: "text-slate-500",
            row: "hover:border-white/[0.08]",
          };

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition hover:bg-white/[0.035] ${styles.row}`}
    >
      <span className="text-[13px] font-medium text-slate-300">{label}</span>
      <span className={`flex items-center gap-2.5 text-xs font-semibold ${styles.subtle}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${styles.bar}`} aria-hidden />
        {styles.text}
      </span>
    </div>
  );
}

function PanelChrome({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-teal-500/[0.12] via-white/[0.04] to-violet-500/[0.08] p-[1px] shadow-[0_24px_64px_-32px_rgba(0,0,0,0.75)]">
      <div className="rounded-[19px] border border-white/[0.05] bg-[#090b11]/94 backdrop-blur-xl">{children}</div>
    </div>
  );
}

function SkeletonMetrics() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="h-[108px] animate-pulse rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] ring-1 ring-inset ring-white/[0.04]"
        />
      ))}
    </div>
  );
}

function feedAccent(kind: string): { stripe: string; pill: string; pillText: string } {
  switch (kind) {
    case "alert":
      return {
        stripe: "border-l-amber-400/70 bg-amber-500/[0.06]",
        pill: "border-amber-500/30 bg-amber-500/10 text-amber-100",
        pillText: "Alert",
      };
    case "promo":
      return {
        stripe: "border-l-cyan-400/70 bg-cyan-500/[0.04]",
        pill: "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
        pillText: "Promo",
      };
    case "signup":
      return {
        stripe: "border-l-teal-400/70 bg-teal-500/[0.04]",
        pill: "border-teal-500/25 bg-teal-500/10 text-teal-100",
        pillText: "Signup",
      };
    case "usage":
      return {
        stripe: "border-l-violet-400/55 bg-violet-500/[0.04]",
        pill: "border-violet-500/25 bg-violet-500/10 text-violet-100",
        pillText: "Usage",
      };
    default:
      return {
        stripe: "border-l-slate-500/50 bg-white/[0.02]",
        pill: "border-white/10 bg-white/[0.04] text-slate-300",
        pillText: kind || "Event",
      };
  }
}

export function AdminOverviewClient() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/overview").then((r) => r.json() as Promise<OverviewResponse>),
      fetch("/api/admin/activity").then((r) => r.json()) as Promise<{ items: FeedItem[] }>,
    ])
      .then(([o, a]) => {
        setOverview(o && "ok" in o && (o as OverviewResponse).ok ? (o as OverviewResponse) : null);
        setFeed(Array.isArray((a as { items?: FeedItem[] })?.items) ? (a as { items: FeedItem[] }).items : []);
      })
      .catch(() => {
        setOverview(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const m = overview?.metrics;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 border-b border-white/[0.06] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Console
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] font-medium text-slate-500">Internal operations</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-[1.75rem]">Operations</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
              Live workspace telemetry for billing counters, quotas, and environment readiness.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-lg border border-white/[0.08] bg-[#0c0e14] px-2.5 py-1 font-mono text-[11px] tabular-nums text-teal-200/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
              Period {overview?.periodKey ?? "—"}
            </span>
            <span className="text-xs text-slate-600">UTC · database-backed</span>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Loading…</p>
          <SkeletonMetrics />
        </div>
      ) : !m ? (
        <div className="rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-500/[0.08] to-transparent px-6 py-16 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
          <p className="text-sm font-medium text-rose-100">Could not load overview.</p>
          <p className="mt-2 text-xs text-rose-200/55">Check admin access and try again.</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Key metrics</h2>
              <span className="text-[10px] text-slate-600">Month-to-date where noted</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total users" value={m.totalUsers} accent="neutral" />
              <MetricCard
                label="Active accounts"
                value={m.activeAccounts}
                sub="Stripe, trial window, or promo access"
                accent="teal"
              />
              <MetricCard label="Trial windows" value={m.trialUsers} sub="Excluding active Stripe subs" accent="amber" />
              <MetricCard label="Promo access windows" value={m.promoAccessUsers} accent="cyan" />
              <MetricCard
                label="Paying Stripe seats"
                value={m.payingSubscriptions}
                sub={`Starter ${m.starterPaying} · Pro ${m.proPaying}`}
                accent="violet"
              />
              <MetricCard label="Linked Amazon OAuth" value={m.connectedAmazonAccounts} accent="teal" />
              <MetricCard
                label="Catalog + keyword searches"
                value={m.searchesMonthToDate}
                sub="Month-to-date across all workspaces"
                accent="neutral"
              />
              <MetricCard
                label="API requests (mtd)"
                value={m.apiRequestsMonthToDate.toLocaleString()}
                sub="All metered quotas · month-to-date"
                accent="teal"
              />
              <MetricCard
                label="Est. MRR (USD)"
                value={`≈ ${m.estimatedMonthlyRevenueUsd.toLocaleString()}`}
                sub={m.estimatesNote}
                accent="violet"
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-8">
            <PanelChrome>
              <section className="p-5 sm:p-6">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">System signals</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Lightweight environment checks — pair with external uptime for production SLA.
                </p>
                <div className="mt-6 space-y-2.5">
                  <HealthRow label="Database" tier={overview!.health.database === "ok" ? "operational" : "attention"} />
                  <HealthRow
                    label="SP-API configuration"
                    tier={overview!.health.spApiConfigured ? "operational" : "attention"}
                  />
                  <HealthRow label="Railway deployment" tier={overview!.health.railwayDetected ? "operational" : "idle"} />
                  <HealthRow
                    label="OpenAI vision (image scans)"
                    tier={overview!.health.imageSearchEnabled ? "operational" : "idle"}
                  />
                  <HealthRow label="Keepa API token" tier={overview!.health.keepaConfigured ? "operational" : "idle"} />
                </div>
              </section>
            </PanelChrome>

            <PanelChrome>
              <section className="p-5 sm:p-6">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Activity stream</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Onboarding, redemptions, quota motion, and internal alerts (recent window).
                </p>
                <ul className="admin-overview-feed mt-5 max-h-[380px] space-y-2 overflow-y-auto pr-2">
                  {feed.slice(0, 24).map((ev) => {
                    const a = feedAccent(ev.kind);
                    return (
                      <li
                        key={ev.id}
                        className={`rounded-xl border border-white/[0.06] border-l-[3px] px-3 py-2.5 text-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.1] hover:bg-white/[0.02] ${a.stripe}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${a.pill}`}
                              >
                                {a.pillText}
                              </span>
                              <span className="font-semibold leading-snug text-slate-100">{ev.title}</span>
                            </div>
                            {ev.detail ? (
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{ev.detail}</p>
                            ) : null}
                          </div>
                          <time className="shrink-0 pt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                            {new Date(ev.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {feed.length === 0 ? (
                  <p className="mt-5 rounded-xl border border-dashed border-white/[0.08] py-10 text-center text-xs text-slate-600">
                    No recent feed items.
                  </p>
                ) : null}
              </section>
            </PanelChrome>
          </div>
        </>
      )}
    </div>
  );
}
