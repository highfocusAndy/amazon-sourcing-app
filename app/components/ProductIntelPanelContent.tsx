"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, type MouseEvent, type ReactNode } from "react";
import { amazonOfferListingUrl } from "@/lib/marketplaces";
import { computeEffectiveEconomics, approvalRequiredEffective, approvalEligibilityUnset } from "@/lib/sourcingIntelligence";
import { estimateMonthlySalesFromBsr } from "@/lib/salesEstimate";
import { useCompetitionThresholds } from "@/app/context/CompetitionThresholdsContext";
import type { ProductAnalysis, SellerType } from "@/lib/types";
import {
  AiInsightStrip,
  CompetitionIntelBlock,
  HF_INNER_CARD_STATIC,
  HF_INNER_CARD,
  HF_KPI_LABEL,
  IntelSection,
  RestrictionsExplain,
  SourcingRiskAndOpportunityHeader,
  buildSyntheticAiInsightSentence,
  marginPerformanceClass,
  profitPerformanceClass,
  roiPerformanceClass,
} from "@/app/components/SourcingPanelIntel";

const INPUT_FIELD_CLASS =
  "w-full rounded-[10px] border border-white/[0.09] bg-slate-950/30 px-2.5 py-1.5 text-[13px] tabular-nums text-slate-100 placeholder:text-slate-500 outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] transition-[border-color,box-shadow] duration-150 focus:border-teal-500/42 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.12)]";

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString();
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}


function roundToClean(n: number): number {
  if (n < 50) return Math.max(1, Math.round(n));
  if (n < 500) return Math.round(n / 25) * 25;
  if (n < 2_000) return Math.round(n / 100) * 100;
  if (n < 10_000) return Math.round(n / 250) * 250;
  return Math.round(n / 1_000) * 1_000;
}

function formatSalesRange(estimate: number): string {
  const low = Math.max(1, roundToClean(Math.round(estimate * 0.65)));
  const high = roundToClean(Math.round(estimate * 1.4));
  if (low >= high) return `~${low.toLocaleString()}/mo`;
  return `~${low.toLocaleString()}–${high.toLocaleString()}/mo`;
}

function parsePositiveInput(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function effectiveUnitCost(detailPanelCost: string, wholesalePrice: number): number {
  const trimmed = detailPanelCost.trim();
  if (trimmed !== "" && Number.isFinite(parseFloat(trimmed))) {
    return Math.max(0, parseFloat(trimmed));
  }
  return Math.max(0, wholesalePrice);
}

function decisionDisplayLabel(decision: ProductAnalysis["decision"]): string {
  const labels: Record<ProductAnalysis["decision"], string> = {
    BUY: "Buy",
    "WORTH UNGATING": "Worth ungating",
    LOW_MARGIN: "Low margin",
    NO_MARGIN: "No margin",
    BAD: "Bad",
    UNKNOWN: "",
  };
  return labels[decision] ?? decision;
}

function decisionBadgeClasses(decision: ProductAnalysis["decision"]): string {
  const shell =
    "inline-flex shrink-0 items-center rounded-full border px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-inset ring-white/[0.04] transition-[transform,box-shadow] duration-200 hover:scale-[1.02] motion-reduce:hover:scale-100";
  if (decision === "BUY")
    return `${shell} border-emerald-400/38 bg-emerald-950/50 text-emerald-50 shadow-[0_0_20px_-10px_rgba(52,211,153,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] ring-emerald-400/12`;
  if (decision === "WORTH UNGATING")
    return `${shell} border-amber-400/38 bg-amber-950/50 text-amber-50 shadow-[0_0_20px_-10px_rgba(251,191,36,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] ring-amber-400/12`;
  if (decision === "LOW_MARGIN")
    return `${shell} border-orange-400/32 bg-orange-950/45 text-orange-50 ring-orange-400/10`;
  if (decision === "NO_MARGIN" || decision === "BAD")
    return `${shell} border-rose-400/38 bg-rose-950/50 text-rose-50 shadow-[0_0_22px_-10px_rgba(251,113,133,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] ring-rose-400/12`;
  return `${shell} border-white/12 bg-slate-800/65 text-slate-300`;
}

function decisionExplanation(item: ProductAnalysis): string | null {
  if (item.decision === "BAD") {
    if (item.ipComplaintRisk === true) {
      return "IP or brand complaint risk from Amazon restrictions.";
    }
    if (item.salesRank != null && item.salesRank > 100_000) {
      return `BSR ${item.salesRank.toLocaleString()} is above 100,000.`;
    }
    const badReason = item.reasons.find((r) => /sales rank|above 100|IP|complaint risk/i.test(r));
    return badReason ?? item.reasons[0] ?? null;
  }
  if (item.decision === "NO_MARGIN") {
    return item.netProfit != null && item.netProfit <= 0
      ? "No profit at your cost and current buy box."
      : item.reasons[0] ?? null;
  }
  if (item.decision === "LOW_MARGIN") {
    return item.roiPercent != null && item.roiPercent < 10 ? "ROI below 10%." : item.reasons[0] ?? null;
  }
  if (item.decision === "WORTH UNGATING") {
    return "Gated but projected profit justifies ungating cost.";
  }
  if (item.decision === "BUY") {
    return "Profit and ROI look good at current data.";
  }
  return item.reasons[0] ?? null;
}

function variationSubtypeLabel(product: ProductAnalysis): string | null {
  const mg = product.matchGroup;
  const reason = (product.matchReason ?? "").toLowerCase();
  if (mg !== "variation") return null;
  if (/scent|fragrance|flavor|flavour/.test(reason)) return "Scent / flavor";
  if (/color|colour/.test(reason)) return "Color";
  if (/size/.test(reason)) return "Size";
  return "Variant";
}

export type ProductIntelPanelContentProps = {
  product: ProductAnalysis;
  marketplaceDomain: string;
  sellerType: SellerType;
  onSellerTypeChange: (next: SellerType) => void;
  detailPanelCost: string;
  onDetailPanelCostChange: (value: string) => void;
  shippingCost: string;
  onShippingCostChange: (value: string) => void;
  projectedMonthlyUnits: string;
  onProjectedMonthlyUnitsChange: (value: string) => void;
  openSellerModal: (e: MouseEvent<HTMLButtonElement>, filter: "all" | "FBA" | "FBM") => void;
  /** Analyzer shows an extra hint when scan identified a variation type */
  variationDetail?: "explorer" | "analyzer";
  /** Whether the user has a connected Amazon seller account. When false, gating data is hidden. */
  amazonConnected?: boolean;
  /** Optional content after structured sections (e.g. legacy ProductInsightBlurb) */
  children?: ReactNode;
};

export function ProductIntelPanelContent({
  product: selectedProduct,
  marketplaceDomain,
  sellerType,
  onSellerTypeChange,
  detailPanelCost,
  onDetailPanelCostChange,
  shippingCost,
  onShippingCostChange,
  projectedMonthlyUnits,
  onProjectedMonthlyUnitsChange,
  openSellerModal,
  variationDetail = "explorer",
  amazonConnected = true,
  children,
}: ProductIntelPanelContentProps) {
  const competitionThresholds = useCompetitionThresholds();

  const detailEconomics = useMemo(
    () => computeEffectiveEconomics(selectedProduct, detailPanelCost),
    [selectedProduct, detailPanelCost],
  );

  const salesEstimate = useMemo(() => {
    if (selectedProduct.estimatedMonthlySales != null && selectedProduct.estimatedMonthlySales > 0) {
      return selectedProduct.estimatedMonthlySales;
    }
    if (selectedProduct.salesRank != null) {
      return estimateMonthlySalesFromBsr(selectedProduct.salesRank, selectedProduct.salesRankCategory);
    }
    return null;
  }, [selectedProduct.estimatedMonthlySales, selectedProduct.salesRank, selectedProduct.salesRankCategory]);


  const amazonListingUrl =
    selectedProduct.asin ? amazonOfferListingUrl(marketplaceDomain, selectedProduct.asin) : null;
  const productUrl = selectedProduct.affiliateUrl ?? amazonListingUrl;

  const sellersLine = (
    <>
      {selectedProduct.offerCount != null ? (
        (selectedProduct.sellerDetails ?? []).length > 0 ? (
          <button
            type="button"
            onClick={(ev) => openSellerModal(ev, "all")}
            className="underline decoration-slate-500 underline-offset-2 hover:decoration-slate-400"
          >
            {selectedProduct.offerCount} seller{selectedProduct.offerCount !== 1 ? "s" : ""}
          </button>
        ) : (
          `${selectedProduct.offerCount} seller${selectedProduct.offerCount !== 1 ? "s" : ""}`
        )
      ) : (
        "—"
      )}
      {selectedProduct.fbaOfferCount != null || selectedProduct.fbmOfferCount != null ? (
        <span className="text-slate-400">
          {" "}
          (FBA:{" "}
          {(selectedProduct.sellerDetails ?? []).length > 0 ? (
            <button
              type="button"
              onClick={(ev) => openSellerModal(ev, "FBA")}
              className="underline decoration-slate-500 underline-offset-2 hover:decoration-slate-400"
            >
              {selectedProduct.fbaOfferCount ?? "—"}
            </button>
          ) : (
            selectedProduct.fbaOfferCount ?? "—"
          )}
          , FBM:{" "}
          {(selectedProduct.sellerDetails ?? []).length > 0 ? (
            <button
              type="button"
              onClick={(ev) => openSellerModal(ev, "FBM")}
              className="underline decoration-slate-500 underline-offset-2 hover:decoration-slate-400"
            >
              {selectedProduct.fbmOfferCount ?? "—"}
            </button>
          ) : (
            selectedProduct.fbmOfferCount ?? "—"
          )}
          )
        </span>
      ) : null}
    </>
  );

  return (
    <div className="panel-loaded space-y-3">
      <SourcingRiskAndOpportunityHeader
        product={selectedProduct}
        effectiveRoi={detailEconomics.roi}
        effectiveNet={detailEconomics.net}
      />

      <div className="flex items-center" role="status">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/22 bg-emerald-950/35 px-2 py-0.5 text-[10px] font-semibold leading-tight text-emerald-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" aria-hidden />
          Live snapshot
        </span>
      </div>

      <IntelSection eyebrow="Product">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="shrink-0 sm:w-[7.75rem]">
            <div className="relative overflow-hidden rounded-[13px] border border-white/[0.09] bg-gradient-to-b from-slate-700/35 to-slate-900/80 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_40px_-18px_rgba(0,0,0,0.75)] ring-1 ring-black/25 transition-[box-shadow,border-color] duration-200 hover:border-white/[0.12] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_48px_-14px_rgba(0,0,0,0.8)] motion-reduce:transition-none">
              {selectedProduct.imageUrl ? (
                productUrl ? (
                  <a
                    href={productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open this product on Amazon"
                    className="block rounded-[10px] outline-none ring-teal-400/70 ring-offset-2 ring-offset-slate-800 focus-visible:ring-2"
                  >
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.title || "Product"}
                      referrerPolicy="no-referrer"
                      className="h-[6.75rem] w-full rounded-[10px] bg-slate-950/45 object-contain transition duration-200 hover:opacity-95"
                    />
                  </a>
                ) : (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.title || "Product"}
                    referrerPolicy="no-referrer"
                    className="h-[6.75rem] w-full rounded-[10px] bg-slate-950/45 object-contain"
                  />
                )
              ) : (
                <div className="flex h-[6.75rem] w-full items-center justify-center rounded-[10px] bg-slate-950/35 text-xl text-slate-600">
                  —
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
                {productUrl ? (
                  <a
                    href={productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open this product on Amazon"
                    className="font-medium leading-snug text-slate-100 underline decoration-slate-500 underline-offset-2 transition hover:text-teal-300 hover:decoration-teal-300"
                  >
                    {selectedProduct.title || selectedProduct.asin || "Product"}
                  </a>
                ) : (
                  <p className="font-medium leading-snug text-slate-100">{selectedProduct.title || selectedProduct.asin || "Product"}</p>
                )}
                {selectedProduct.offerLabel ? (
                  <p className="mt-1 text-sm text-teal-400">Listing: {selectedProduct.offerLabel}</p>
                ) : null}
                {selectedProduct.brand ? <p className="text-sm text-slate-400">Brand: {selectedProduct.brand}</p> : null}
                {selectedProduct.asin ? <p className="text-xs text-slate-500">ASIN: {selectedProduct.asin}</p> : null}
                {selectedProduct.salesRankCategory ? (
                  <p className="text-xs text-slate-500">Category: {selectedProduct.salesRankCategory}</p>
                ) : null}
                {selectedProduct.starRating != null || selectedProduct.reviewCount != null ? (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {selectedProduct.starRating != null ? (
                      <span className="font-semibold text-amber-400">{"★".repeat(Math.round(selectedProduct.starRating))}{"☆".repeat(5 - Math.round(selectedProduct.starRating))}</span>
                    ) : null}
                    {selectedProduct.starRating != null ? (
                      <span className="text-slate-300">{selectedProduct.starRating.toFixed(1)}</span>
                    ) : null}
                    {selectedProduct.reviewCount != null ? (
                      <span className="text-slate-500">({selectedProduct.reviewCount.toLocaleString()} reviews)</span>
                    ) : null}
                  </div>
                ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {decisionDisplayLabel(selectedProduct.decision) ? (
                <span className={decisionBadgeClasses(selectedProduct.decision)}>{decisionDisplayLabel(selectedProduct.decision)}</span>
              ) : null}
              {(() => {
                const explanation = decisionExplanation(selectedProduct);
                return explanation ? (
                  <span className="text-sm text-slate-400">— {explanation}</span>
                ) : null;
              })()}
            </div>
          </div>
        </div>

        <div className={HF_INNER_CARD_STATIC}>
          <p className={HF_KPI_LABEL}>Gated / eligible</p>
          {!amazonConnected ? (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Connect your Amazon account to check your eligibility.
            </p>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {approvalRequiredEffective(selectedProduct) ? (
                <span className="rounded-full border border-amber-400/35 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_16px_-8px_rgba(251,191,36,0.2)] ring-1 ring-inset ring-amber-400/12">
                  Approval required
                </span>
              ) : selectedProduct.approvalRequired === false ? (
                <span className="rounded-full border border-white/12 bg-slate-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  No approval required
                </span>
              ) : null}
              {selectedProduct.listingRestricted === true ? (
                <span className="rounded-full border border-amber-400/35 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_16px_-8px_rgba(251,191,36,0.2)] ring-1 ring-inset ring-amber-400/12">
                  Listing restricted
                </span>
              ) : selectedProduct.listingRestricted === false ? (
                <span className="rounded-full border border-white/12 bg-slate-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  Not restricted
                </span>
              ) : null}
              {approvalEligibilityUnset(selectedProduct) && selectedProduct.listingRestricted == null ? (
                <span className="text-[11px] text-slate-500">—</span>
              ) : null}
            </div>
          )}
        </div>
      </IntelSection>

      <div className="border-t border-white/[0.06] pt-3">
        <IntelSection eyebrow="Profitability">
          {/* Public pricing — always visible */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className={HF_INNER_CARD}>
              <p className={HF_KPI_LABEL}>Best Sellers Rank</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums tracking-tight text-slate-50">
                {selectedProduct.salesRank != null ? formatNumber(selectedProduct.salesRank) : "—"}
              </p>
              {selectedProduct.salesRank != null && selectedProduct.salesRankCategory && (
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                  in {selectedProduct.salesRankCategory}
                </p>
              )}
            </div>
            <div className={HF_INNER_CARD}>
              <p className={HF_KPI_LABEL}>Buy box</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums tracking-tight text-slate-50">
                {formatCurrency(selectedProduct.buyBoxPrice)}
              </p>
            </div>
            {salesEstimate != null && salesEstimate > 0 ? (
              <div
                className={`${HF_INNER_CARD} col-span-2`}
                title="Estimate based on BSR + category. Not guaranteed."
              >
                <p className={HF_KPI_LABEL}>Est. sales / mo</p>
                <p className="mt-0.5 text-lg font-extrabold tabular-nums tracking-tight text-slate-50">
                  {formatSalesRange(salesEstimate)}{" "}
                  <span className="text-[10px] font-normal text-slate-500">(est.)</span>
                </p>
              </div>
            ) : null}
          </div>

          {/* Profitability calculator */}
          <div className="mt-2 space-y-2 rounded-[14px] border border-teal-500/18 bg-gradient-to-b from-slate-900/88 to-slate-900/48 p-2.5 shadow-[inset_0_1px_0_rgba(45,212,191,0.06),0_20px_56px_-30px_rgba(0,0,0,0.65)]">
              <p className="border-b border-white/[0.05] pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-teal-400/90">
                Profitability calculator
              </p>

              <div className="flex rounded-[11px] border border-white/[0.08] bg-slate-950/35 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]">
                <button
                  type="button"
                  onClick={() => onSellerTypeChange("FBA")}
                  className={`flex-1 rounded-[9px] px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-[color,background-color,box-shadow] duration-200 ${
                    sellerType === "FBA"
                      ? "bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-teal-400/25"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  }`}
                >
                  FBA
                </button>
                <button
                  type="button"
                  onClick={() => onSellerTypeChange("FBM")}
                  className={`flex-1 rounded-[9px] px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-[color,background-color,box-shadow] duration-200 ${
                    sellerType === "FBM"
                      ? "bg-teal-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-teal-400/25"
                      : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                  }`}
                >
                  FBM
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Your cost</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={detailPanelCost}
                    onChange={(e) => onDetailPanelCostChange(e.target.value)}
                    placeholder="Enter your cost"
                    className={INPUT_FIELD_CLASS}
                  />
                </div>
                {sellerType === "FBM" ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Shipping cost (FBM)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={shippingCost}
                      onChange={(e) => onShippingCostChange(e.target.value)}
                      className={INPUT_FIELD_CLASS}
                    />
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Units (for total buy &amp; projected profit)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={projectedMonthlyUnits}
                    onChange={(e) => onProjectedMonthlyUnitsChange(e.target.value)}
                    className={INPUT_FIELD_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className={`${HF_INNER_CARD} ring-1 ring-teal-500/10`}>
                  <p className={HF_KPI_LABEL}>Profit</p>
                  <p
                    className={`mt-0.5 text-[1.35rem] font-extrabold leading-none tabular-nums tracking-tight ${profitPerformanceClass(detailEconomics.net ?? selectedProduct.netProfit)}`}
                  >
                    {formatCurrency(detailEconomics.net ?? selectedProduct.netProfit)}
                  </p>
                </div>
                <div className={`${HF_INNER_CARD} ring-1 ring-teal-500/10`}>
                  <p className={HF_KPI_LABEL}>ROI</p>
                  <p
                    className={`mt-0.5 text-[1.35rem] font-extrabold leading-none tabular-nums tracking-tight ${roiPerformanceClass(detailEconomics.roi ?? selectedProduct.roiPercent)}`}
                  >
                    {formatPercent(detailEconomics.roi ?? selectedProduct.roiPercent)}
                  </p>
                </div>
                <div className={`${HF_INNER_CARD} col-span-2 border-teal-500/15 ring-1 ring-teal-500/12`}>
                  <p className={HF_KPI_LABEL}>Margin</p>
                  <p
                    className={`mt-0.5 text-[1.35rem] font-extrabold leading-none tabular-nums tracking-tight ${marginPerformanceClass(detailEconomics.marginPct)}`}
                  >
                    {formatPercent(detailEconomics.marginPct)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className={HF_INNER_CARD_STATIC}>
                  <p className={HF_KPI_LABEL}>Wholesale / stored cost</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">
                    {detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
                      ? formatCurrency(parseFloat(detailPanelCost))
                      : formatCurrency(selectedProduct.wholesalePrice)}
                  </p>
                </div>
                <div className={HF_INNER_CARD_STATIC}>
                  <p className={HF_KPI_LABEL}>Fees (ref / {selectedProduct.sellerType === "FBA" ? "FBA" : "FBM ship"})</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">{formatCurrency(selectedProduct.totalFees)}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                    Ref {formatCurrency(selectedProduct.referralFee)}
                    {selectedProduct.sellerType === "FBA"
                      ? ` · FBA ${formatCurrency(selectedProduct.fbaFee)}`
                      : ` · Ship ${formatCurrency(selectedProduct.shippingCost)}`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                <div className={HF_INNER_CARD_STATIC}>
                  <p className={HF_KPI_LABEL}>Total buy cost ({projectedMonthlyUnits} units)</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">
                    {(() => {
                      const qty = parsePositiveInput(projectedMonthlyUnits);
                      const cost = effectiveUnitCost(detailPanelCost, selectedProduct.wholesalePrice);
                      return qty !== null ? formatCurrency(roundToTwo(cost * qty)) : "—";
                    })()}
                  </p>
                </div>
                <div className={HF_INNER_CARD_STATIC}>
                  <p className={HF_KPI_LABEL}>Projected profit ({projectedMonthlyUnits} × net profit)</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">
                    {(() => {
                      const qty = parsePositiveInput(projectedMonthlyUnits);
                      const netP = detailEconomics.net ?? selectedProduct.netProfit;
                      return netP != null && qty != null ? formatCurrency(roundToTwo(netP * qty)) : "—";
                    })()}
                  </p>
                </div>
              </div>
            </div>
        </IntelSection>
      </div>

      <IntelSection eyebrow="Competition">
        {selectedProduct.amazonSalesVolumeLabel ? (
          <div className="rounded-lg border border-slate-600 bg-emerald-900/30 px-3 py-2">
            <p className="text-xs text-slate-500">Product sells (from Amazon)</p>
            <p className="font-semibold text-slate-100">{selectedProduct.amazonSalesVolumeLabel}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Extracted from product page when available.</p>
          </div>
        ) : null}
        {selectedProduct.offerCount != null || selectedProduct.fbaOfferCount != null || selectedProduct.fbmOfferCount != null ? (
          <CompetitionIntelBlock product={selectedProduct} sellersLine={sellersLine} />
        ) : (
          <p className="text-[11px] text-slate-500">Structured offer breakdown will appear once Amazon pricing data loads.</p>
        )}
      </IntelSection>

      <IntelSection eyebrow="Price history">
        <div className="relative overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
          {/* fake sparkline bars */}
          <div className="mb-2 flex items-end gap-1 h-14">
            {[40, 65, 52, 78, 60, 85, 70, 55, 90, 72, 68, 80].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-teal-600/30"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <p className="text-[10px] text-slate-600">Keepa price history chart</p>
          {/* coming soon overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-slate-900/75 backdrop-blur-[2px]">
            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-teal-300">
              Coming Soon
            </span>
            <p className="text-[11px] text-slate-500">Keepa integration</p>
          </div>
        </div>
      </IntelSection>

      <IntelSection eyebrow="Restrictions & compliance">
        {approvalRequiredEffective(selectedProduct) ||
        selectedProduct.listingRestricted ||
        selectedProduct.restrictedBrand ? (
          <div className={HF_INNER_CARD_STATIC}>
            <p className={HF_KPI_LABEL}>Ungating economics</p>
            <ul className="mt-1.5 space-y-1 text-[12px]">
              {selectedProduct.worthUngating != null && (
                <li className="flex justify-between gap-2 leading-snug">
                  <span className="text-slate-500">Worth ungating</span>
                  <span className={selectedProduct.worthUngating ? "font-semibold text-emerald-300" : "font-medium text-slate-300"}>
                    {selectedProduct.worthUngating ? "Yes" : "No"}
                  </span>
                </li>
              )}
              {selectedProduct.ungatingCost10Units != null && (
                <li className="flex justify-between gap-2 leading-snug">
                  <span className="text-slate-500">Cost (10 units)</span>
                  <span className="font-semibold tabular-nums text-slate-100">{formatCurrency(selectedProduct.ungatingCost10Units)}</span>
                </li>
              )}
              {selectedProduct.breakEvenUnits != null && (
                <li className="flex justify-between gap-2 leading-snug">
                  <span className="text-slate-500">Break-even units</span>
                  <span className="font-semibold tabular-nums text-slate-100">{formatNumber(selectedProduct.breakEvenUnits)}</span>
                </li>
              )}
              {selectedProduct.projectedMonthlyProfit != null && (
                <li className="flex justify-between gap-2 leading-snug">
                  <span className="text-slate-500">Projected monthly profit</span>
                  <span className="font-semibold tabular-nums text-slate-100">{formatCurrency(selectedProduct.projectedMonthlyProfit)}</span>
                </li>
              )}
            </ul>
          </div>
        ) : null}

        {(() => {
          const codes = selectedProduct.restrictionReasonCodes;
          const hasHazmat = codes.some((c) => /HAZMAT|HAZARD|DANGEROUS/i.test(c));
          return (
            <div className="grid grid-cols-1 gap-1.5">
              <div className={HF_INNER_CARD_STATIC}>
                <p className={HF_KPI_LABEL}>IP / complaint risk</p>
                <p className="mt-0.5 text-[15px] font-bold text-slate-50">{selectedProduct.ipComplaintRisk ? "Yes" : "No"}</p>
                {selectedProduct.ipComplaintRisk === true ? <RestrictionsExplain kind="ip" /> : null}
              </div>
              <div className={HF_INNER_CARD_STATIC}>
                <p className={HF_KPI_LABEL}>Meltable</p>
                <p className="mt-0.5 text-[15px] font-bold text-slate-50">{selectedProduct.meltableRisk ? "Yes" : "No"}</p>
                {selectedProduct.meltableRisk === true ? <RestrictionsExplain kind="meltable" /> : null}
              </div>
              <div className={HF_INNER_CARD_STATIC}>
                <p className={HF_KPI_LABEL}>Hazmat</p>
                <p
                  className={`mt-0.5 text-[15px] font-bold ${
                    selectedProduct.isHazmat === true ? "text-rose-300" : selectedProduct.isHazmat === false ? "text-slate-50" : "text-slate-500"
                  }`}
                >
                  {selectedProduct.isHazmat === true ? "Yes" : selectedProduct.isHazmat === false ? "No" : hasHazmat ? "Yes" : "—"}
                </p>
                {selectedProduct.isHazmat === true || hasHazmat ? <RestrictionsExplain kind="hazmat" /> : null}
                {selectedProduct.isHazmat === null && !hasHazmat ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Load product details to check</p>
                ) : null}
              </div>
              <div className="rounded-[11px] border border-amber-400/22 bg-amber-950/25 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <p className={HF_KPI_LABEL}>Private label (possible)</p>
                <p className="mt-0.5 text-[15px] font-bold text-slate-50">{selectedProduct.privateLabelRisk ? "Yes" : "No"}</p>
              </div>
            </div>
          );
        })()}
      </IntelSection>

      <IntelSection eyebrow="Variations">
        {(() => {
          const codes = selectedProduct.restrictionReasonCodes;
          const fromRestrictionCodes = codes.some((c) => /VARIATION|VAR\b|PARENT_CHILD/i.test(c));
          const fromCatalog = selectedProduct.hasCatalogVariationFamily;
          const mg = selectedProduct.matchGroup;

          const isVariationYes =
            variationDetail === "analyzer"
              ? mg === "variation" || fromCatalog === true || fromRestrictionCodes
              : fromCatalog === true || fromRestrictionCodes;
          const isVariationNo =
            variationDetail === "analyzer"
              ? mg === "multipack" || (mg === null && !isVariationYes && fromCatalog === false && !fromRestrictionCodes)
              : fromCatalog === false && !fromRestrictionCodes;
          const variationLabel = isVariationYes ? "Yes" : isVariationNo ? "No" : "—";
          const variationType = variationDetail === "analyzer" ? variationSubtypeLabel(selectedProduct) : null;

          return (
            <div className={HF_INNER_CARD_STATIC}>
              <p className={HF_KPI_LABEL}>Variation family</p>
              <p className="mt-0.5 text-[15px] font-bold text-slate-50">{variationLabel}</p>
              {variationType ? <p className="mt-1 text-[11px] font-semibold text-teal-300/95">{variationType}</p> : null}
              {variationLabel === "—" ? (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Shown when catalog lists parent/child ASINs or a restriction code mentions variations.
                </p>
              ) : null}
            </div>
          );
        })()}
      </IntelSection>

      <IntelSection eyebrow="Alerts & notes">
        {(() => {
          const visibleReasons = selectedProduct.reasons.filter((r) => !/^Restriction codes:/i.test(r));
          const showAlerts =
            visibleReasons.length > 0 ||
            selectedProduct.error ||
            selectedProduct.listingRestricted ||
            approvalRequiredEffective(selectedProduct) ||
            selectedProduct.restrictedBrand;
          if (!showAlerts) {
            return <p className="text-[11px] leading-relaxed text-slate-500">No extra alerts on this snapshot.</p>;
          }
          return (
          <div className="rounded-[12px] border border-amber-400/24 bg-gradient-to-br from-amber-950/40 to-amber-950/[0.12] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/90">Alerts / Amazon info</p>
            {selectedProduct.error ? <p className="mt-1 text-sm font-medium leading-snug text-rose-300">{selectedProduct.error}</p> : null}
            {selectedProduct.restrictedBrand ? <p className="mt-1 text-xs text-amber-200/95">Restricted brand list</p> : null}
            {selectedProduct.listingRestricted ? <p className="mt-1 text-xs text-amber-200/95">Listing restricted</p> : null}
            {approvalRequiredEffective(selectedProduct) ? <p className="mt-1 text-xs text-amber-200/95">Approval required</p> : null}
            {visibleReasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-amber-100/95">
                {visibleReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
          );
        })()}
      </IntelSection>

      <AiInsightStrip
        sentence={buildSyntheticAiInsightSentence(selectedProduct, detailEconomics.roi, competitionThresholds)}
      />

      {children}
    </div>
  );
}
