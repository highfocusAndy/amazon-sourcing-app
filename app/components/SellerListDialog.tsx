"use client";

import { type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { amazonSellerStorefrontUrl } from "@/lib/marketplaces";
import { computeSellerListPopoverPosition } from "@/lib/popoverPosition";
import type { ProductAnalysis } from "@/lib/types";

export type SellerModalState =
  | null
  | { filter: "all" | "FBA" | "FBM"; layout: "sheet" }
  | {
      filter: "all" | "FBA" | "FBM";
      layout: "popover";
      top: number;
      left: number;
      width: number;
      maxHeight: number;
      panelTop: number;
      panelLeft: number;
      panelWidth: number;
      panelHeight: number;
    };

export function buildSellerModalState(
  e: MouseEvent<HTMLButtonElement>,
  filter: "all" | "FBA" | "FBM",
): SellerModalState {
  if (typeof window === "undefined") return null;
  if (window.innerWidth < 1024) return { filter, layout: "sheet" };

  const panel = e.currentTarget.closest(".product-details-panel")?.getBoundingClientRect();
  if (!panel) return { filter, layout: "sheet" };

  const trigger = e.currentTarget.getBoundingClientRect();
  const { top, left, width, maxHeight } = computeSellerListPopoverPosition(trigger, panel);
  return {
    filter,
    layout: "popover",
    top,
    left,
    width,
    maxHeight,
    panelTop: panel.top,
    panelLeft: panel.left,
    panelWidth: panel.width,
    panelHeight: panel.height,
  };
}

type SellerListDialogProps = {
  sellerModal: SellerModalState;
  sellerSheetVisible: boolean;
  selectedProduct: ProductAnalysis;
  marketplaceDomain: string;
  onClose: () => void;
  renderSellerRow?: (seller: NonNullable<ProductAnalysis["sellerDetails"]>[number], index: number) => ReactNode;
};

function defaultSellerRow(
  s: NonNullable<ProductAnalysis["sellerDetails"]>[number],
  marketplaceDomain: string,
): ReactNode {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-600/80 bg-slate-700/50 px-3 py-2 text-xs transition hover:border-slate-500 hover:bg-slate-600/45">
      <a
        href={amazonSellerStorefrontUrl(marketplaceDomain, s.sellerId)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start justify-between gap-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-sm"
        title={`View seller ${s.sellerId} on Amazon`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          {s.sellerDisplayName ? (
            <span className="block truncate font-medium text-slate-100 underline decoration-slate-500 underline-offset-2 hover:text-teal-300">
              {s.sellerDisplayName}
            </span>
          ) : null}
          <span
            className={
              s.sellerDisplayName
                ? "block break-all font-mono text-[11px] text-slate-500"
                : "block break-all font-mono text-slate-200"
            }
          >
            {s.sellerId}
          </span>
        </div>
        <span className="shrink-0 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">{s.channel}</span>
      </a>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-slate-400">
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
          {s.feedbackCount != null && <span title="Feedback count">{s.feedbackCount.toLocaleString()} feedback</span>}
          {s.feedbackPercent != null && <span title="Positive feedback %">{s.feedbackPercent}% positive</span>}
          {s.feedbackCount == null && s.feedbackPercent == null && <span>—</span>}
        </span>
        <a
          href={amazonSellerStorefrontUrl(marketplaceDomain, s.sellerId)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[10px] font-medium text-teal-400/90 hover:text-teal-300"
          onClick={(ev) => ev.stopPropagation()}
        >
          All listings ↗
        </a>
      </div>
    </div>
  );
}

export function SellerListDialog({
  sellerModal,
  sellerSheetVisible,
  selectedProduct,
  marketplaceDomain,
  onClose,
  renderSellerRow,
}: SellerListDialogProps) {
  if (typeof document === "undefined") return null;
  if (!sellerModal || !(selectedProduct.sellerDetails ?? []).length) return null;

  const sellers =
    sellerModal.filter === "all"
      ? (selectedProduct.sellerDetails ?? [])
      : (selectedProduct.sellerDetails ?? []).filter((s) => s.channel === sellerModal.filter);

  const title =
    sellerModal.filter === "all" ? "Sellers" : sellerModal.filter === "FBA" ? "FBA sellers" : "FBM sellers";

  const backdropStyle =
    sellerModal.layout === "popover"
      ? {
          top: sellerModal.panelTop,
          left: sellerModal.panelLeft,
          width: sellerModal.panelWidth,
          height: sellerModal.panelHeight,
        }
      : undefined;

  return createPortal(
    <>
      <button
        type="button"
        className={
          sellerModal.layout === "sheet"
            ? "fixed inset-0 z-[200] bg-slate-950/50 backdrop-blur-[1px]"
            : "fixed z-[200] bg-slate-950/50 backdrop-blur-[1px]"
        }
        style={backdropStyle}
        onClick={onClose}
        aria-label="Close sellers list"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sellers list"
        className={
          sellerModal.layout === "sheet"
            ? `fixed inset-y-0 right-0 z-[205] flex max-h-[100svh] w-[min(100vw,24rem)] flex-col overflow-hidden border-l border-slate-600 bg-slate-800 shadow-2xl transition-transform duration-300 ease-out ${
                sellerSheetVisible ? "translate-x-0" : "translate-x-full pointer-events-none"
              }`
            : "fixed z-[205] flex min-h-0 flex-col overflow-hidden overflow-x-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-xl"
        }
        style={
          sellerModal.layout === "popover"
            ? {
                top: sellerModal.top,
                left: sellerModal.left,
                width: sellerModal.width,
                height: sellerModal.maxHeight,
                maxHeight: sellerModal.maxHeight,
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-600 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">
            {sellerModal.layout === "sheet"
              ? "Tap outside or × to close. Tap a seller for their Amazon storefront."
              : "Click a seller to open their Amazon storefront in a new tab."}
          </p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2">
          {sellers.map((s, i) => (
            <li key={`${s.sellerId}-${i}`} className="mb-2 last:mb-0">
              {renderSellerRow ? renderSellerRow(s, i) : defaultSellerRow(s, marketplaceDomain)}
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
