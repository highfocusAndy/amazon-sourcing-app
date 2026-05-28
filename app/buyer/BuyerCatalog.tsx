"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  { label: "Sort by…", value: "" },
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

type Audience = "" | "men" | "women" | "kids" | "boys" | "girls";
type Condition = "new" | "used" | "refurbished" | "collectible";

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
  audience: Audience;
  condition: Condition;
};

const CONDITION_OPTIONS: { label: string; value: Condition }[] = [
  { label: "New", value: "new" },
  { label: "Used", value: "used" },
  { label: "Refurbished", value: "refurbished" },
  { label: "Collectible", value: "collectible" },
];

// Keywords that benefit from an audience facet (gender / age group).
const AUDIENCE_TRIGGER_PATTERN =
  /\b(shirt|t-shirt|tshirt|tee|pants|jeans|shoes|sneakers|boots|sandals|sweater|hoodie|jacket|coat|dress|skirt|shorts|hat|cap|socks|underwear|swimwear|polo|tracksuit|tank|leggings|pajamas|belt|wallet|bag|backpack|sunglasses|watch|gloves|scarf|clothing|outfit)\b/i;

const AUDIENCE_OPTIONS: { label: string; value: Audience }[] = [
  { label: "Any", value: "" },
  { label: "Men", value: "men" },
  { label: "Women", value: "women" },
  { label: "Kids", value: "kids" },
  { label: "Boys", value: "boys" },
  { label: "Girls", value: "girls" },
];

const INITIAL_STATE: SearchParamsState = {
  keyword: "",
  category: "All",
  subcategory: "",
  sort: "",
  minPrice: "",
  maxPrice: "",
  minRating: 0,
  primeOnly: false,
  brand: "",
  priceSource: "lowest",
  bsrMax: 0,
  audience: "",
  condition: "new",
};

export function BuyerCatalog({ userMode }: { userMode: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const [state, setState] = useState<SearchParamsState>(INITIAL_STATE);

  const [items, setItems] = useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Autocomplete suggestions.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Mobile filter drawer.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (mobileFiltersOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileFiltersOpen]);

  // Infinite scroll sentinel.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Refs to avoid re-creating IntersectionObserver on every render.
  const stateRef = useRef(state);
  const tokenRef = useRef(nextPageToken);
  const loadingRef = useRef(loading);
  stateRef.current = state;
  tokenRef.current = nextPageToken;
  loadingRef.current = loading;

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
      if (params.audience) q.set("audience", params.audience);
      if (params.condition) q.set("condition", params.condition);
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
      // Cross-page ASIN dedupe — seed continuation can surface the same product
      // in multiple variations, so we filter against everything already shown.
      setItems((prev) => {
        if (!append) return fetched;
        const seen = new Set(prev.map((p) => p.asin));
        const fresh = fetched.filter((p) => p.asin && !seen.has(p.asin));
        return [...prev, ...fresh];
      });
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

  // Debounced autocomplete fetch as the user types.
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buyer/suggestions?q=${encodeURIComponent(trimmed)}`);
        const data = (await res.json()) as { suggestions?: string[] };
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Click-outside to dismiss the suggestion dropdown.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Infinite scroll — re-run whenever nextPageToken changes so the observer
  // connects to the sentinel AFTER it first renders (it's null on mount).
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loadingRef.current && tokenRef.current) {
          void fetchProducts(stateRef.current, tokenRef.current, true);
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  // nextPageToken in deps: when it changes from null → value the sentinel
  // just rendered, this effect re-fires and actually connects the observer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProducts, nextPageToken]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    submitSearch(searchInput);
  }

  // Fresh keyword search — wipes all filters back to defaults.
  function submitSearch(keyword: string) {
    setSearchInput(keyword);
    setShowSuggestions(false);
    const next: SearchParamsState = {
      ...INITIAL_STATE,
      keyword,
    };
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

  function resetFilters() {
    setSearchInput("");
    setState(INITIAL_STATE);
    void fetchProducts(INITIAL_STATE, null, false);
  }

  const selectCls = "w-full rounded-xl border bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";
  const inputCls = "w-full rounded-xl border border-slate-700/60 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#C9A84C]/60 focus:ring-1 focus:ring-[#C9A84C]/30";

  const activeSubcats = SUBCATEGORIES[state.category] ?? [];

  // Count of non-default active filters (for the mobile button badge).
  const activeFilterCount = [
    state.category !== "All",
    state.subcategory !== "",
    state.sort !== "",
    state.minPrice !== "",
    state.maxPrice !== "",
    state.minRating > 0,
    state.primeOnly,
    state.brand !== "",
    state.priceSource !== "lowest",
    state.bsrMax > 0,
    state.audience !== "",
    state.condition !== "new",
  ].filter(Boolean).length;

  const renderFilters = () => (
    <>
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
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Condition</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CONDITION_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => updateState({ condition: o.value })}
              className="rounded-lg border py-1.5 text-[11px] font-semibold transition"
              style={{
                borderColor: state.condition === o.value ? G_BORD : "rgba(71,85,105,0.5)",
                background: state.condition === o.value ? G_DIM : "transparent",
                color: state.condition === o.value ? G : "rgb(148 163 184)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
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
            inputMode="numeric"
            min="0"
            placeholder="Min"
            value={state.minPrice}
            onChange={(e) => setState((s) => ({ ...s, minPrice: e.target.value }))}
            onBlur={() => updateState({ minPrice: state.minPrice })}
            className={inputCls}
          />
          <input
            type="number"
            inputMode="numeric"
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
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search bar — glassmorphism: translucent slate with backdrop blur. */}
      <div className="border-b border-slate-700/40 bg-slate-900/40 px-4 py-3 backdrop-blur-md">
        <div ref={searchBoxRef} className="relative">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="Search Amazon products…"
              className="flex-1 rounded-xl border border-slate-700/40 bg-slate-800/30 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none backdrop-blur-md transition focus:border-[#C9A84C]/60 focus:bg-slate-800/50 focus:ring-2 focus:ring-[#C9A84C]/20"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg shadow-amber-500/10 transition hover:shadow-amber-500/20 disabled:opacity-50"
              style={{ background: G, color: "#0a0800" }}
            >
              Search
            </button>
          </form>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900 shadow-2xl sm:right-[88px]"
              role="listbox"
            >
              {suggestions.map((s, i) => (
                <button
                  key={`${s}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submitSearch(s);
                  }}
                  className="block w-full truncate px-4 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                >
                  <span className="text-slate-500">🔍</span> {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audience chips — appear when the active keyword suggests apparel / personal items. */}
        {AUDIENCE_TRIGGER_PATTERN.test(state.keyword) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">For</span>
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value || "any"}
                type="button"
                onClick={() => updateState({ audience: opt.value })}
                className="rounded-full border px-3 py-1 text-[11px] font-semibold transition"
                style={{
                  borderColor: state.audience === opt.value ? G_BORD : "rgba(71,85,105,0.5)",
                  background: state.audience === opt.value ? G_DIM : "transparent",
                  color: state.audience === opt.value ? G : "rgb(148 163 184)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

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
        {/* Desktop sidebar — filters (md+) */}
        <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-700/60 bg-slate-900/40 p-4 md:flex">
          {renderFilters()}
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
              <div className="flex items-center gap-3">
                {/* Mobile Filters button (hidden on desktop where the sidebar is visible). */}
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition md:hidden"
                  style={{ borderColor: G_BORD, background: G_DIM, color: G }}
                  aria-label="Open filters"
                >
                  <span>☰</span> Filters
                  {activeFilterCount > 0 && (
                    <span
                      className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
                      style={{ background: G, color: "#0a0800" }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <span>
                  Showing <span className="text-slate-300">{state.priceSource === "lowest" ? "Lowest" : "Buy Box"}</span> price
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <BuyerProductCard key={item.asin} item={item} priceSource={state.priceSource} />
            ))}
            {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>

          {/* Sentinel is always present so loadMoreRef.current is set before
              the observer effect runs. The callback checks tokenRef itself. */}
          <div ref={loadMoreRef} aria-hidden className="h-1 w-full" />
          {items.length > 0 && loading && (
            <p className="mt-4 text-center text-[12px] text-slate-500">Loading more…</p>
          )}
          {items.length > 0 && !nextPageToken && !loading && (
            <p className="mt-6 text-center text-[12px] text-slate-600">— End of results —</p>
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

          {/* Amazon Associates disclosure — required for the affiliate program. */}
          <p className="mt-8 border-t border-slate-800/80 pt-4 text-center text-[11px] leading-relaxed text-slate-600">
            As an Amazon Associate, we earn from qualifying purchases.
          </p>
        </main>
      </div>

      {/* Floating mobile Filters FAB — always reachable while scrolling. */}
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full px-5 py-3 text-[12px] font-bold shadow-2xl transition active:scale-95 md:hidden"
        style={{ background: G, color: "#0a0800" }}
        aria-label="Open filters"
      >
        <span>☰</span> Filters
        {activeFilterCount > 0 && (
          <span
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-bold text-white"
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Mobile filter drawer (slides up from bottom). */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setMobileFiltersOpen(false)}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
          />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-slate-700/60"
            style={{ background: "#0f172a" }}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">Filters</span>
                {activeFilterCount > 0 && (
                  <span
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                    style={{ background: G, color: "#0a0800" }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              {renderFilters()}
            </div>
            <div className="border-t border-slate-700/60 px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full rounded-xl py-3 text-sm font-bold transition active:scale-[0.99]"
                style={{ background: G, color: "#0a0800" }}
              >
                Show {items.length} results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
