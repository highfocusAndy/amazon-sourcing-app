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

// Sub-category drill-down (additive keyword search). Keeps the UX simple — no Amazon classification IDs needed.
const SUBCATEGORIES: Record<string, string[]> = {
  Electronics: ["Headphones", "Phones", "Computers", "Cameras", "TV & Audio", "Smart Home", "Gaming", "Wearables"],
  "Home & Kitchen": ["Cookware", "Furniture", "Bedding", "Bathroom", "Storage", "Decor", "Appliances", "Vacuums"],
  "Beauty & Personal Care": ["Makeup", "Skincare", "Hair Care", "Fragrance", "Tools", "Men's Grooming"],
  "Sports & Outdoors": ["Fitness", "Outdoor", "Cycling", "Team Sports", "Camping", "Water Sports", "Hunting"],
  "Toys & Games": ["Action Figures", "Board Games", "Puzzles", "Building Sets", "Dolls", "Stuffed Animals", "Outdoor Toys"],
  Books: ["Fiction", "Non-Fiction", "Children's", "Cookbooks", "Self-Help", "Sci-Fi & Fantasy", "Business"],
  Clothing: ["Men's", "Women's", "Kids", "Shoes", "Accessories", "Activewear", "Jewelry"],
  "Pet Supplies": ["Dog", "Cat", "Fish", "Birds", "Small Animals", "Reptiles"],
  Automotive: ["Tools", "Interior", "Exterior", "Electronics", "Tires & Wheels", "Oil & Fluids"],
  "Office Products": ["Paper", "Pens & Writing", "Desk Organization", "Furniture", "Tech", "Calendars"],
};

const SORT_OPTIONS = [
  { label: "Best Match", value: "relevance" },
  { label: "Best Sellers (BSR)", value: "bestsellers" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Top Rated", value: "rating" },
  { label: "Newest Arrivals", value: "newest" },
];

const BSR_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "Top 1k", value: 1000 },
  { label: "Top 10k", value: 10000 },
  { label: "Top 100k", value: 100000 },
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

type SearchParamsState = {
  keyword: string;
  category: string;
  subcategory: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
  minRating: number;
  primeOnly: boolean;
  brand: string;
  priceSource: "buybox" | "lowest";
  bsrMax: number;
};

const INITIAL_STATE: SearchParamsState = {
  keyword: "",
  category: "All",
  subcategory: "",
  sort: "bestsellers",
  minPrice: "",
  maxPrice: "",
  minRating: 0,
  primeOnly: false,
  brand: "",
  priceSource: "buybox",
  bsrMax: 0,
};

export function BuyerCatalog({ userMode }: { userMode: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const [state, setState] = useState<SearchParamsState>(INITIAL_STATE);

  const [items, setItems] = useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const isBuyer = userMode === "buyer";

  const fetchProducts = useCallback(async (
    params: SearchParamsState,
    pageToken: string | null,
    append: boolean,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        keyword: params.keyword,
        category: params.category === "All" ? "" : params.category,
        subcategory: params.subcategory,
        sort: params.sort,
        priceSource: params.priceSource,
      });
      if (params.minPrice) q.set("minPrice", params.minPrice);
      if (params.maxPrice) q.set("maxPrice", params.maxPrice);
      if (params.minRating > 0) q.set("minRating", String(params.minRating));
      if (params.brand) q.set("brand", params.brand);
      if (params.bsrMax > 0) q.set("bsrMax", String(params.bsrMax));
      if (params.primeOnly) q.set("primeOnly", "true");
      if (pageToken) q.set("pageToken", pageToken);

      const res = await fetch(`/api/buyer/search?${q.toString()}`);
      const data = (await res.json()) as {
        ok?: boolean;
        items?: BuyerCatalogItem[];
        nextPageToken?: string | null;
        error?: string;
      };
      if (!res.ok || !data.items) {
        setError(data.error ?? "Failed to load products.");
        if (!append) setItems([]);
        return;
      }
      const fetched = data.items;
      setItems((prev) => (append ? [...prev, ...fetched] : fetched));
      setNextPageToken(data.nextPageToken ?? null);
    } catch {
      setError("Network error. Please try again.");
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial landing — best sellers.
  useEffect(() => {
    void fetchProducts(INITIAL_STATE, null, false);
  }, [fetchProducts]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...state, keyword: searchInput, subcategory: "" };
    setState(next);
    void fetchProducts(next, null, false);
  }

  function updateState(patch: Partial<SearchParamsState>) {
    const next = { ...state, ...patch };
    // Selecting a different category clears the sub-category filter.
    if (patch.category !== undefined && patch.category !== state.category) {
      next.subcategory = "";
    }
    setState(next);
    void fetchProducts(next, null, false);
  }

  function handleLoadMore() {
    if (!nextPageToken) return;
    void fetchProducts(state, nextPageToken, true);
  }

  function resetFilters() {
    setSearchInput("");
    setState(INITIAL_STATE);
    void fetchProducts(INITIAL_STATE, null, false);
  }

  const selectCls = "w-full rounded-xl border bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";
  const inputCls = "w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";

  const activeSubcats = SUBCATEGORIES[state.category] ?? [];

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

        {/* Sub-category chips */}
        {activeSubcats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => updateState({ subcategory: "" })}
              className="rounded-full border px-3 py-1 text-[11px] font-semibold transition"
              style={{
                borderColor: state.subcategory === "" ? G_BORD : "rgba(71,85,105,0.5)",
                background: state.subcategory === "" ? G_DIM : "transparent",
                color: state.subcategory === "" ? G : "rgb(148 163 184)",
              }}
            >
              All {state.category}
            </button>
            {activeSubcats.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => updateState({ subcategory: sub })}
                className="rounded-full border px-3 py-1 text-[11px] font-medium transition"
                style={{
                  borderColor: state.subcategory === sub ? G_BORD : "rgba(71,85,105,0.5)",
                  background: state.subcategory === sub ? G_DIM : "transparent",
                  color: state.subcategory === sub ? G : "rgb(148 163 184)",
                }}
              >
                {sub}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — filters */}
        <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700/60 bg-slate-900/40 p-4 md:flex">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Category</p>
            <select
              value={state.category}
              onChange={(e) => updateState({ category: e.target.value })}
              className={selectCls}
              style={{ borderColor: "rgba(71,85,105,0.6)" }}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Sort By</p>
            <select
              value={state.sort}
              onChange={(e) => updateState({ sort: e.target.value })}
              className={selectCls}
              style={{ borderColor: "rgba(71,85,105,0.6)" }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Price Source</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => updateState({ priceSource: "buybox" })}
                className="flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition"
                style={{
                  borderColor: state.priceSource === "buybox" ? G_BORD : "rgba(71,85,105,0.5)",
                  background: state.priceSource === "buybox" ? G_DIM : "transparent",
                  color: state.priceSource === "buybox" ? G : "rgb(148 163 184)",
                }}
              >
                Buy Box
              </button>
              <button
                type="button"
                onClick={() => updateState({ priceSource: "lowest" })}
                className="flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition"
                style={{
                  borderColor: state.priceSource === "lowest" ? G_BORD : "rgba(71,85,105,0.5)",
                  background: state.priceSource === "lowest" ? G_DIM : "transparent",
                  color: state.priceSource === "lowest" ? G : "rgb(148 163 184)",
                }}
              >
                Lowest
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Price Range</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={state.minPrice}
                onChange={(e) => setState((s) => ({ ...s, minPrice: e.target.value }))}
                onBlur={() => updateState({ minPrice: state.minPrice })}
                className={inputCls}
              />
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={state.maxPrice}
                onChange={(e) => setState((s) => ({ ...s, maxPrice: e.target.value }))}
                onBlur={() => updateState({ maxPrice: state.maxPrice })}
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
                  onClick={() => updateState({ minRating: state.minRating === r ? 0 : r })}
                  className="flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition"
                  style={{
                    borderColor: state.minRating === r ? G_BORD : "rgba(71,85,105,0.5)",
                    background: state.minRating === r ? G_DIM : "transparent",
                    color: state.minRating === r ? G : "rgb(148 163 184)",
                  }}
                >
                  {r}★
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Best Sellers Rank</p>
            <div className="flex flex-wrap gap-1.5">
              {BSR_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => updateState({ bsrMax: o.value })}
                  className="rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition"
                  style={{
                    borderColor: state.bsrMax === o.value ? G_BORD : "rgba(71,85,105,0.5)",
                    background: state.bsrMax === o.value ? G_DIM : "transparent",
                    color: state.bsrMax === o.value ? G : "rgb(148 163 184)",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Brand</p>
            <input
              type="text"
              placeholder="e.g. Sony, Apple"
              value={state.brand}
              onChange={(e) => setState((s) => ({ ...s, brand: e.target.value }))}
              onBlur={() => updateState({ brand: state.brand })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateState({ brand: state.brand }); } }}
              className={inputCls}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => updateState({ primeOnly: !state.primeOnly })}
              className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition"
              style={{
                borderColor: state.primeOnly ? G_BORD : "rgba(71,85,105,0.5)",
                background: state.primeOnly ? G_DIM : "transparent",
                color: state.primeOnly ? G : "rgb(148 163 184)",
              }}
            >
              <span className="text-[14px]" style={{ color: "#00A8E0" }}>P</span>
              Prime only
            </button>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="w-full rounded-xl border border-slate-700/60 px-3 py-2 text-[11px] font-semibold text-slate-400 transition hover:text-slate-200"
          >
            Reset all filters
          </button>
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

          {items.length > 0 && (
            <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>{items.length} products</span>
              <span>
                Showing <span className="text-slate-300">{state.priceSource === "lowest" ? "Lowest" : "Buy Box"}</span> price
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <BuyerProductCard key={item.asin} item={item} priceSource={state.priceSource} />
            ))}
            {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>

          {!loading && nextPageToken && items.length > 0 && (
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
