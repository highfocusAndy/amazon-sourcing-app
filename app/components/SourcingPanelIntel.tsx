"use client";

import type { ReactNode } from "react";
import type { ProductAnalysis } from "@/lib/types";
import { useCompetitionThresholds } from "@/app/context/CompetitionThresholdsContext";
import type { CompetitionThresholds } from "@/lib/competitionThresholds";
import {
  buildAiInsightSentence,
  buildOpportunitySummary,
  getCompetitionInsight,
  getSourcingRiskLevel,
  type OpportunitySummary,
} from "@/lib/sourcingIntelligence";

/** Layered SaaS inner card — depth without heavy color */
export const HF_INNER_CARD =
  "rounded-[11px] border border-white/[0.078] bg-gradient-to-b from-white/[0.045] to-white/[0.02] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_28px_-14px_rgba(0,0,0,0.55)] transition-[box-shadow,border-color,transform] duration-200 hover:border-white/[0.11] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_36px_-12px_rgba(0,0,0,0.58)] hover:-translate-y-px motion-reduce:transform-none motion-reduce:transition-none";

export const HF_INNER_CARD_STATIC =
  "rounded-[11px] border border-white/[0.078] bg-gradient-to-b from-white/[0.045] to-white/[0.02] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_6px_24px_-12px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] duration-200 hover:border-white/[0.1]";

export const HF_INNER_CARD_TIGHT =
  "rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_18px_-10px_rgba(0,0,0,0.5)] transition-[box-shadow,border-color,transform] duration-200 hover:border-white/[0.1] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-10px_rgba(0,0,0,0.55)] hover:-translate-y-px motion-reduce:transform-none";

export const HF_KPI_LABEL = "mb-0.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500 leading-tight";

function RiskBadge({ level }: { level: ReturnType<typeof getSourcingRiskLevel> }) {
  const cfg = {
    low: {
      text: "Low risk",
      className:
        "border border-emerald-500/35 bg-emerald-950/40 text-emerald-100/95 shadow-[0_0_20px_-8px_rgba(52,211,153,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-inset ring-emerald-400/15",
    },
    caution: {
      text: "Caution",
      className:
        "border border-amber-400/35 bg-amber-950/45 text-amber-50 shadow-[0_0_22px_-8px_rgba(251,191,36,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-inset ring-amber-400/12",
    },
    high: {
      text: "High risk",
      className:
        "border border-rose-400/38 bg-rose-950/50 text-rose-50 shadow-[0_0_22px_-8px_rgba(251,113,133,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-rose-400/15",
    },
  } as const;
  const x = cfg[level];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-3 py-0.5 text-[10px] font-semibold tracking-wide transition-transform duration-200 hover:scale-[1.02] motion-reduce:hover:scale-100 ${x.className}`}
    >
      {x.text}
    </span>
  );
}

function OpportunityCard({ summary }: { summary: OpportunitySummary }) {
  const tone =
    summary.tone === "positive"
      ? "border-emerald-500/25 bg-gradient-to-br from-emerald-950/35 to-emerald-950/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      : summary.tone === "warn"
        ? "border-rose-400/28 bg-gradient-to-br from-rose-950/40 to-rose-950/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        : "border-white/[0.09] bg-gradient-to-br from-slate-800/80 to-slate-900/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";

  return (
    <div
      className={`min-w-0 flex-1 rounded-[13px] border px-2.5 py-2 shadow-[0_14px_40px_-22px_rgba(0,0,0,0.65)] backdrop-blur-sm transition-[box-shadow,border-color] duration-200 hover:border-white/[0.12] hover:shadow-[0_18px_48px_-20px_rgba(0,0,0,0.7)] ${tone}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400/95">Opportunity summary</p>
      <p
        className={`mt-1 text-[13px] font-semibold leading-snug tracking-tight ${
          summary.tone === "positive"
            ? "text-emerald-50"
            : summary.tone === "warn"
              ? "text-rose-50"
              : "text-slate-50"
        }`}
      >
        {summary.headline}
      </p>
      <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-400">
        {summary.bullets.map((b) => (
          <li key={b} className="flex gap-2 pl-0.5">
            <span className="mt-2 h-px w-1.5 shrink-0 rounded-full bg-teal-400/70" aria-hidden />
            <span className="text-slate-300/95">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grouped panel section */
export function IntelSection({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <section className="group rounded-[14px] border border-white/[0.068] bg-slate-800/42 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_14px_48px_-26px_rgba(0,0,0,0.65)] backdrop-blur-[6px] transition-[border-color,box-shadow] duration-200 hover:border-white/[0.09] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_56px_-24px_rgba(0,0,0,0.72)]">
      <h3 className="border-b border-white/[0.05] pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300/98">{eyebrow}</h3>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </section>
  );
}

export function AiInsightStrip({ sentence }: { sentence: string }) {
  return (
    <div className="rounded-[13px] border border-violet-400/22 bg-gradient-to-br from-violet-950/45 to-violet-950/[0.15] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_14px_40px_-20px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-[border-color] duration-200 hover:border-violet-400/30">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200/85">Insight</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-200/96">{sentence}</p>
    </div>
  );
}

const RISK_HINTS = {
  ip: "Brands with aggressive enforcement can remove offers—review brand policies.",
  meltable: "Heat-sensitive SKUs may be restricted or surcharged during warm months.",
  hazmat: "May require dangerous goods approval for inbound FBA.",
} as const;

export function RestrictionsExplain({ kind }: { kind: keyof typeof RISK_HINTS }) {
  return <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{RISK_HINTS[kind]}</p>;
}

export function SourcingRiskAndOpportunityHeader({
  product,
  effectiveRoi,
  effectiveNet,
}: {
  product: ProductAnalysis;
  effectiveRoi: number | null;
  effectiveNet: number | null;
}) {
  const competitionThresholds = useCompetitionThresholds();
  const riskLevel = getSourcingRiskLevel(product, { effectiveRoi }, competitionThresholds);
  const summary = buildOpportunitySummary(
    product,
    {
      effectiveRoi,
      effectiveNet,
    },
    competitionThresholds,
  );

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
      <RiskBadge level={riskLevel} />
      <OpportunityCard summary={summary} />
    </div>
  );
}

export function CompetitionIntelBlock({
  product,
  sellersLine,
}: {
  product: ProductAnalysis;
  sellersLine: ReactNode;
}) {
  const competitionThresholds = useCompetitionThresholds();
  const ci = getCompetitionInsight(product, competitionThresholds);
  const tint =
    ci.density === "high"
      ? "border-amber-400/28 bg-gradient-to-br from-amber-950/30 to-transparent"
      : ci.density === "low"
        ? "border-emerald-400/26 bg-gradient-to-br from-emerald-950/28 to-transparent"
        : "border-white/[0.08] bg-white/[0.02]";

  return (
    <div className={`rounded-[11px] border px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_8px_32px_-18px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-colors duration-200 hover:border-white/[0.1] ${tint}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Seller competition</p>
      </div>
      {ci.labels.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {ci.labels.map((l) => (
            <li
              key={l}
              className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-300/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[transform,border-color] duration-150 hover:border-teal-500/22 hover:bg-slate-900/65"
            >
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 text-[15px] font-bold tabular-nums leading-tight tracking-tight text-slate-50">{sellersLine}</div>
    </div>
  );
}

export { marginPerformanceClass, profitPerformanceClass, roiPerformanceClass } from "@/lib/sourcingIntelligence";

export function buildSyntheticAiInsightSentence(
  product: ProductAnalysis,
  effectiveRoi: number | null,
  competitionThresholds: CompetitionThresholds,
): string {
  return buildAiInsightSentence(product, { effectiveRoi }, competitionThresholds);
}
