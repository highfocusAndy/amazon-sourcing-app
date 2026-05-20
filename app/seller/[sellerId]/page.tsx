"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CatalogItem } from "@/lib/spApiClient";

function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString();
}

export default function SellerListingsPage() {
  const params = useParams<{ sellerId: string }>();
  const sellerId = params?.sellerId ?? "";

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresAmazon, setRequiresAmazon] = useState(false);

  const fetchPage = useCallback(async (pageToken?: string | null) => {
    if (!sellerId) return;
    const isLoadMore = Boolean(pageToken);
    if (isLoadMore) {
      setLoadMoreLoading(true);
    } else {
      setLoading(true);
      setError(null);
      setRequiresAmazon(false);
    }

    try {
      const params = new URLSearchParams({ pageSize: "20" });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`/api/seller/${encodeURIComponent(sellerId)}?${params}`);
      const data = await res.json();

      if (!res.ok) {
        if (data?.requiresAmazonConnection) {
          setRequiresAmazon(true);
        } else {
          setError(data?.error ?? "Failed to load listings.");
        }
        return;
      }

      setItems((prev) => (isLoadMore ? [...prev, ...(data.items ?? [])] : (data.items ?? [])));
      setNextPageToken(data.nextPageToken ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
      setLoadMoreLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchPage(null);
  }, [fetchPage]);

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-slate-950 p-4 sm:gap-6 sm:p-6">
      <header className="rounded-xl border border-slate-700/80 border-t-4 border-t-teal-500 bg-slate-900/80 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">Seller Listings</h1>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{sellerId}</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Loading listings…</div>
      ) : requiresAmazon ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-6 text-center">
          <p className="text-base font-semibold text-amber-200/90">Amazon account required</p>
          <p className="mt-2 text-sm text-slate-400">Connect your Amazon seller account to view listings from this seller.</p>
          <Link
            href="/settings"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-slate-900 transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #E8CC7A 0%, #C9A84C 60%)" }}
          >
            Connect Amazon →
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-center text-sm text-rose-300">
          {error}
          <button
            type="button"
            onClick={() => fetchPage(null)}
            className="ml-3 underline decoration-rose-400/60 underline-offset-2 hover:decoration-rose-400"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">No listings found for this seller.</div>
      ) : (
        <>
          <p className="text-xs text-slate-500">{items.length} listing{items.length !== 1 ? "s" : ""} loaded</p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <li key={item.asin} className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3 transition hover:border-slate-600">
                <div className="flex gap-3">
                  {item.imageUrl ? (
                    <div className="shrink-0">
                      <img
                        src={item.imageUrl}
                        alt={item.title ?? ""}
                        referrerPolicy="no-referrer"
                        className="h-16 w-16 rounded-lg bg-slate-800 object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-[12px] font-medium leading-snug text-slate-100">
                      {item.title ?? item.asin ?? "—"}
                    </p>
                    {item.asin ? (
                      <p className="font-mono text-[10px] text-slate-500">{item.asin}</p>
                    ) : null}
                    {item.brand ? (
                      <p className="text-[11px] text-slate-400">{item.brand}</p>
                    ) : null}
                    {item.rank != null ? (
                      <p className="text-[10px] text-slate-500">BSR: {formatNumber(item.rank)}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {nextPageToken ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadMoreLoading}
                onClick={() => fetchPage(nextPageToken)}
                className="rounded-xl border border-teal-500/30 bg-teal-950/30 px-6 py-2.5 text-sm font-semibold text-teal-300 transition hover:bg-teal-900/40 disabled:opacity-50"
              >
                {loadMoreLoading ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
