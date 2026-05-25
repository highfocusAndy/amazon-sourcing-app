"use client";

import { useCallback, useEffect, useState } from "react";
import { BuyerProductCard } from "./BuyerProductCard";
import type { BuyerCatalogItem } from "@/lib/paApiClient";
import Link from "next/link";

const CATEGORIES = [
  "All",
  "Electronics",
  "Home & Kitchen",
  "Beauty & Personal Care",
  "Sports & Outdoors",
  "Toys & Games",
  "Books",
  "Clothing",
  "Pet Supplies",
  "Automotive",
  "Office Products",
];

const SORT_OPTIONS = [
  { label: "Best Match", value: "relevance" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Top Rated", value: "rating" },
];

const G = "#C9A84C";
const G_DIM = "rgba(201,168,76,0.12)";
const G_BORD = "rgba(201,168,76,0.3)";

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="aspect-square bg-slate-800" />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded bg-slate-700 w-full" />
        <div className="h-3 rounded bg-slate-700 w-4/5" />
        <div className="h-4 rounded bg-slate-700/60 w-1/3 mt-2" />
        <div className="h-8 rounded-xl bg-slate-700/40 mt-2" />
      </div>
    </div>
  );
}

export function BuyerCatalog({ userMode }: { userMode: string | null }) {
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("relevance");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRating, setMinRating] = useState<number>(0);
  const [primeOnly, setPrimeOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const isBuyer = userMode === "buyer";

  const fetchProducts = useCallback(async (
    kw: string, cat: string, sortVal: string,
    minP: string, maxP: string, minR: number,
    pg: number, append: boolean,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        keyword: kw,
        category: cat === "All" ? "" : cat,
        sort: sortVal,
        page: String(pg),
      });
      if (minP) params.set("minPrice", minP);
      if (maxP) params.set("maxPrice", maxP);
      if (minR > 0) params.set("minRating", String(minR));

      const res = await fetch(`/api/buyer/search?${params.toString()}`);
      const data = (await res.json()) as { ok?: boolean; items?: BuyerCatalogItem[]; error?: string };
      if (!res.ok || !data.items) {
        setError(data.error ?? "Failed to load products.");
        return;
      }
      let fetched = data.items;
      if (primeOnly) {
        fetched = fetched.filter((i) => i.isPrime === true);
      }
      setItems((prev) => (append ? [...prev, ...fetched] : fetched));
      setHasMore(fetched.length >= 10);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [primeOnly]);

  // Initial load
  useEffect(() => {
    void fetchProducts("", "All", "relevance", "", "", 0, 1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setKeyword(searchInput);
    void fetchProducts(searchInput, category, sort, minPrice, maxPrice, minRating, 1, false);
  }

  function handleFilterChange(updates: {
    cat?: string; sortVal?: string; minP?: string; maxP?: string; minR?: number; pg?: number; append?: boolean;
  }) {
    const newCat = updates.cat ?? category;
    const newSort = updates.sortVal ?? sort;
    const newMinP = updates.minP ?? minPrice;
    const newMaxP = updates.maxP ?? maxPrice;
    const newMinR = updates.minR ?? minRating;
    const newPg = updates.pg ?? 1;
    const append = updates.append ?? false;

    if (updates.cat !== undefined) setCategory(newCat);
    if (updates.sortVal !== undefined) setSort(newSort);
    if (updates.minP !== undefined) setMinPrice(newMinP);
    if (updates.maxP !== undefined) setMaxPrice(newMaxP);
    if (updates.minR !== undefined) setMinRating(newMinR);
    if (updates.pg !== undefined) setPage(newPg);

    void fetchProducts(keyword, newCat, newSort, newMinP, newMaxP, newMinR, newPg, append);
  }

  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    handleFilterChange({ pg: next, append: true });
  }

  const selectCls = "w-full rounded-xl border bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";
  const inputCls = "w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search bar */}
      <div className="border-b border-slate-700/60 bg-slate-900/80 px-4 py-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search Amazon products…"
            className="flex-1 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50"
            style={{ background: G, color: "#0a0800" }}
          >
            Search
          </button>
        </form>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — filters */}
        <aside className="hidden w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700/60 bg-slate-900/40 p-4 md:flex">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</p>
            <select
              value={category}
              onChange={(e) => handleFilterChange({ cat: e.target.value })}
              className={selectCls}
              style={{ borderColor: "rgba(71,85,105,0.6)" }}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sort By</p>
            <select
              value={sort}
              onChange={(e) => handleFilterChange({ sortVal: e.target.value })}
              className={selectCls}
              style={{ borderColor: "rgba(71,85,105,0.6)" }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Price Range</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                onBlur={() => handleFilterChange({ minP: minPrice })}
                className={inputCls}
              />
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                onBlur={() => handleFilterChange({ maxP: maxPrice })}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Min Rating</p>
            <div className="flex gap-1.5">
              {[3, 4, 4.5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleFilterChange({ minR: minRating === r ? 0 : r })}
                  className="flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition"
                  style={{
                    borderColor: minRating === r ? G_BORD : "rgba(71,85,105,0.5)",
                    background: minRating === r ? G_DIM : "transparent",
                    color: minRating === r ? G : "rgb(148 163 184)",
                  }}
                >
                  {r}★
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => { setPrimeOnly(!primeOnly); void fetchProducts(keyword, category, sort, minPrice, maxPrice, minRating, 1, false); }}
              className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition"
              style={{
                borderColor: primeOnly ? G_BORD : "rgba(71,85,105,0.5)",
                background: primeOnly ? G_DIM : "transparent",
                color: primeOnly ? G : "rgb(148 163 184)",
              }}
            >
              <span className="text-[14px]" style={{ color: "#00A8E0" }}>P</span>
              Prime only
            </button>
          </div>
        </aside>

        {/* Product grid */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pb-6">
          {error && (
            <p className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-center text-sm text-red-300">
              {error}
            </p>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-4xl">🔍</p>
              <p className="text-slate-400">No products found. Try a different keyword or category.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <BuyerProductCard key={item.asin} item={item} />
            ))}
            {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>

          {!loading && hasMore && items.length > 0 && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-xl border px-8 py-3 text-sm font-semibold transition hover:opacity-80"
                style={{ borderColor: G_BORD, background: G_DIM, color: G }}
              >
                Load more
              </button>
            </div>
          )}

          {/* Bottom banner for buyer users */}
          {isBuyer && (
            <div
              className="mt-8 flex flex-col items-center gap-4 rounded-2xl px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left"
              style={{ background: G_DIM, border: `1px solid ${G_BORD}` }}
            >
              <div>
                <p className="font-semibold text-white">Want to source products professionally?</p>
                <p className="mt-0.5 text-[13px] text-slate-400">
                  Switch to Seller mode — analyze FBA profit, bulk upload lists, and get BUY/PASS decisions.
                </p>
              </div>
              <Link
                href="/billing?plan=starter"
                className="shrink-0 rounded-xl px-6 py-2.5 text-sm font-bold transition hover:opacity-90"
                style={{ background: G, color: "#0a0800" }}
              >
                Start 14-day free trial →
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
