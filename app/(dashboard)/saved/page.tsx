"use client";

import { HeaderAuth } from "@/app/components/HeaderAuth";
import { useSavedProducts } from "@/app/context/SavedProductsContext";
import Link from "next/link";
import type { ProductAnalysis } from "@/lib/types";

function decisionLabel(decision: ProductAnalysis["decision"]): string {
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

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toFixed(2)}`;
}

export default function SavedPage() {
  const { products, remove, clearAll } = useSavedProducts();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4 sm:gap-6 sm:p-6">
      <header className="rounded-xl border border-slate-600/80 bg-slate-800/90 p-4 shadow-lg shadow-black/10 border-t-4 border-t-teal-500 sm:p-6">
        <h1 className="text-xl font-bold text-slate-100 tracking-tight sm:text-2xl">Saved Products</h1>
        <p className="mt-2 text-sm text-slate-400">
          Products you’ve already looked up. Opening them here won’t call the API again—use Analyzer to refresh data.
        </p>
        <HeaderAuth />
      </header>

      <section className="rounded-xl border border-slate-600/80 bg-slate-800/90 shadow-lg shadow-black/10 overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-600/80 px-4 py-3 bg-slate-800/50">
          <p className="text-sm text-slate-400">
            {products.length === 0
              ? "No saved products yet. Use the Analyzer to search by ASIN, keyword, image, or bulk upload—each result is saved automatically."
              : `${products.length} saved product(s). Click to open in Analyzer.`}
          </p>
          {products.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-rose-900/50 hover:text-rose-100 transition-colors"
            >
              Clear all saved
            </button>
          ) : null}
        </div>
        {products.length === 0 ? (
          <div className="p-8 text-center">
            <Link
              href="/analyzer"
              className="inline-flex rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 hover:from-teal-400 hover:to-cyan-500 transition-all"
            >
              Open Analyzer
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-700">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-700/40 transition-colors">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.title || "Product"}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 shrink-0 rounded border border-slate-600 object-contain"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-700 text-slate-500 text-xs">
                    —
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-200">{p.title || p.asin || p.inputIdentifier}</p>
                  <p className="text-xs text-slate-500">
                    {p.asin ?? p.inputIdentifier} · {decisionLabel(p.decision)} · {formatCurrency(p.buyBoxPrice)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    href={`/analyzer?asin=${encodeURIComponent(p.asin || p.inputIdentifier)}`}
                    className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-teal-600 hover:text-white hover:border-teal-500 transition-colors"
                  >
                    Open in Analyzer
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-rose-900/50 hover:text-rose-200"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
