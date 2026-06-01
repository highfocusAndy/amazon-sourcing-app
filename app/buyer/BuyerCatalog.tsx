"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BuyerProductCard } from "./BuyerProductCard";
import type { BuyerCatalogItem } from "@/lib/paApiClient";
import Link from "next/link";
import { BrandBackdrop } from "@/app/components/BrandBackdrop";

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

function filterChipClass(active: boolean, extra = ""): string {
  return `buyer-filter-chip ${active ? "is-active" : ""} ${extra}`.trim();
}

function SkeletonCard() {
  return (
    <div className="buyer-skeleton buyer-product-card flex h-full animate-pulse flex-col overflow-hidden rounded-2xl">
      <div className="buyer-card-image aspect-square shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="h-3 w-full rounded bg-slate-700" />
        <div className="h-3 w-4/5 rounded bg-slate-700" />
        <div className="mt-auto space-y-2">
          <div className="h-4 w-1/3 rounded bg-slate-700/60" />
          <div className="h-10 rounded-xl bg-slate-700/40" />
        </div>
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
  priceSource: "buybox",
  bsrMax: 0,
  audience: "",
  condition: "new",
};

export function BuyerCatalog({ userMode }: { userMode: string | null }) {
  const [searchInput, setSearchInput] = useState("");
  const [state, setState] = useState<SearchParamsState>(INITIAL_STATE);

  const [items, setItems] = useState<BuyerCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // Infinite scroll — scroll root is .buyer-main (not the viewport).
  const mainRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const tokenRef = useRef(nextPageToken);
  const loadingRef = useRef(loading || loadingMore);
  const fetchGenRef = useRef(0);
  const dupSkipRef = useRef(0);
  const fetchProductsRef = useRef<
    (params: SearchParamsState, pageToken: string | null, append: boolean) => Promise<void>
  >(() => Promise.resolve());
  stateRef.current = state;
  tokenRef.current = nextPageToken;
  loadingRef.current = loading || loadingMore;

  const LOAD_ROOT_MARGIN_PX = 400;

  const tryLoadMore = useCallback(() => {
    if (loadingRef.current || !tokenRef.current) return;
    const node = loadMoreRef.current;
    const root = mainRef.current;
    if (!node || !root) return;
    const nodeRect = node.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (nodeRect.top <= rootRect.bottom + LOAD_ROOT_MARGIN_PX) {
      void fetchProductsRef.current(stateRef.current, tokenRef.current, true);
    }
  }, []);

  const isBuyer = userMode === "buyer";

  const fetchProducts = useCallback(async (
    params: SearchParamsState,
    pageToken: string | null,
    append: boolean,
  ) => {
    if (append && loadingRef.current) return;

    if (!append) {
      fetchGenRef.current += 1;
      tokenRef.current = null;
      setNextPageToken(null);
      dupSkipRef.current = 0;
    }

    const gen = fetchGenRef.current;
    loadingRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    let fetched: BuyerCatalogItem[] = [];
    let nextToken: string | null = null;
    let addedCount = 0;

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
      if (gen !== fetchGenRef.current) return;

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

      fetched = data.items;
      addedCount = fetched.length;
      setItems((prev) => {
        if (!append) return fetched;
        const seen = new Set(prev.map((p) => p.asin));
        const fresh = fetched.filter((p) => p.asin && !seen.has(p.asin));
        addedCount = fresh.length;
        return [...prev, ...fresh];
      });

      nextToken = data.nextPageToken ?? null;
      if (append && addedCount === 0) {
        if (!nextToken || nextToken === pageToken) {
          nextToken = null;
          dupSkipRef.current = 0;
        } else {
          dupSkipRef.current += 1;
          // Overlap across seeds/cycles can yield duplicate-only pages — keep going, but cap retries.
          if (dupSkipRef.current > 10) {
            nextToken = null;
            dupSkipRef.current = 0;
          }
        }
      } else {
        dupSkipRef.current = 0;
      }
      tokenRef.current = nextToken;
      setNextPageToken(nextToken);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setError("Network error. Please try again.");
      if (!append) setItems([]);
    } finally {
      if (gen !== fetchGenRef.current) return;
      loadingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
      const shouldPrefetch =
        Boolean(nextToken) &&
        (append ? addedCount > 0 || nextToken !== pageToken : fetched.length > 0);
      if (shouldPrefetch) {
        requestAnimationFrame(() => {
          if (gen !== fetchGenRef.current) return;
          tryLoadMore();
        });
      }
    }
  }, [tryLoadMore]);

  fetchProductsRef.current = fetchProducts;

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

  // Infinite scroll — observe sentinel inside the scrolling main panel (not the viewport).
  useEffect(() => {
    const root = mainRef.current;
    const node = loadMoreRef.current;
    if (!root || !node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) tryLoadMore();
      },
      { root, rootMargin: `${LOAD_ROOT_MARGIN_PX}px`, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [tryLoadMore]);

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

  const selectCls = "buyer-select w-full rounded-xl border px-3 py-2 text-sm outline-none";
  const inputCls = "buyer-input w-full rounded-xl border px-3 py-2 text-sm outline-none";

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
    state.priceSource !== "buybox",
    state.bsrMax > 0,
    state.audience !== "",
    state.condition !== "new",
  ].filter(Boolean).length;

  const renderFilters = () => (
    <>
      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Category</p>
        <select
          value={state.category}
          onChange={(e) => updateState({ category: e.target.value })}
          className={selectCls}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Sort By</p>
        <select
          value={state.sort}
          onChange={(e) => updateState({ sort: e.target.value })}
          className={selectCls}
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Condition</p>
        <div className="grid grid-cols-2 gap-1.5">
          {CONDITION_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => updateState({ condition: o.value })}
              className={filterChipClass(state.condition === o.value, "rounded-lg py-1.5 text-[11px] font-semibold")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Price Source</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => updateState({ priceSource: "buybox" })}
            className={filterChipClass(state.priceSource === "buybox", "flex-1 rounded-lg py-1.5 text-[11px] font-semibold")}
          >
            Buy Box
          </button>
          <button
            type="button"
            onClick={() => updateState({ priceSource: "lowest" })}
            className={filterChipClass(state.priceSource === "lowest", "flex-1 rounded-lg py-1.5 text-[11px] font-semibold")}
          >
            Lowest
          </button>
        </div>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Price Range</p>
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
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Min Rating</p>
        <div className="flex gap-1.5">
          {[3, 4, 4.5].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => updateState({ minRating: state.minRating === r ? 0 : r })}
              className={filterChipClass(state.minRating === r, "flex-1 rounded-lg py-1.5 text-[11px] font-semibold")}
            >
              {r}★
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Best Sellers Rank</p>
        <div className="flex flex-wrap gap-1.5">
          {BSR_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => updateState({ bsrMax: o.value })}
              className={filterChipClass(state.bsrMax === o.value, "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold")}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="buyer-filter-label mb-1.5 text-[10px] font-bold uppercase tracking-widest">Brand</p>
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
          className={filterChipClass(state.primeOnly, "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium")}
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
      {/* Search bar */}
      <div className="buyer-search-bar border-b px-4 py-3">
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
              className="buyer-search-input flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none transition"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading}
              className="buyer-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              Search
            </button>
          </form>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              className="buyer-suggest-menu absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border shadow-2xl sm:right-[88px]"
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
                  className="buyer-suggest-item block w-full truncate px-4 py-2 text-left text-sm text-slate-200 transition"
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
            <span className="buyer-filter-label text-[10px] font-bold uppercase tracking-widest">For</span>
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value || "any"}
                type="button"
                onClick={() => updateState({ audience: opt.value })}
                className={filterChipClass(state.audience === opt.value, "rounded-full px-3 py-1 text-[11px] font-semibold")}
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
              className={filterChipClass(state.subcategory === "", "rounded-full px-3 py-1 text-[11px] font-semibold")}
            >
              All {state.category}
            </button>
            {activeSubcats.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => updateState({ subcategory: sub })}
                className={filterChipClass(state.subcategory === sub, "rounded-full px-3 py-1 text-[11px] font-medium")}
              >
                {sub}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — filters (md+) */}
        <aside className="buyer-sidebar hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r p-4 md:flex">
          {renderFilters()}
        </aside>

        {/* Product grid — HF watermark only behind main content, not the filter sidebar */}
        <main
          ref={mainRef}
          className="buyer-main relative flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pb-6"
        >
          <div className="buyer-main-backdrop" aria-hidden>
            <BrandBackdrop variant="onDark" opacity={0.04} />
          </div>
          <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
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
                  className={filterChipClass(activeFilterCount > 0, "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold md:hidden")}
                  aria-label="Open filters"
                >
                  <span>☰</span> Filters
                  {activeFilterCount > 0 && (
                    <span className="buyer-accent-badge ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <span>
                  Showing <span className="buyer-accent-highlight">{state.priceSource === "lowest" ? "Lowest" : "Buy Box"}</span> price
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <BuyerProductCard key={item.asin} item={item} priceSource={state.priceSource} />
            ))}
            {loading && items.length === 0 &&
              Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={`init-${i}`} />)}
            {loadingMore &&
              Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
          </div>

          {/* Sentinel sits after the grid (including load-more skeletons). */}
          <div ref={loadMoreRef} aria-hidden className="h-4 w-full shrink-0" />
          {items.length > 0 && !nextPageToken && !loading && !loadingMore && (
            <p className="mt-6 text-center text-[12px] text-slate-600">— End of results —</p>
          )}

          {/* Bottom banner for buyer users */}
          {isBuyer && (
            <div className="buyer-cta-banner mt-8 flex flex-col items-center gap-4 rounded-2xl px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p className="font-semibold text-white">Want to source products professionally?</p>
                <p className="mt-0.5 text-[13px] text-slate-400">
                  Switch to Seller mode — analyze FBA profit, bulk upload lists, and get BUY/PASS decisions.
                </p>
              </div>
              <Link
                href="/billing?plan=starter"
                className="buyer-btn-primary shrink-0 rounded-xl px-6 py-2.5 text-sm font-bold"
              >
                Start 14-day free trial →
              </Link>
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Floating mobile Filters FAB — sits above the always-visible disclosure footer. */}
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="buyer-btn-primary fixed bottom-14 right-5 z-30 flex items-center gap-2 rounded-full px-5 py-3 text-[12px] font-bold transition active:scale-95 md:hidden"
        aria-label="Open filters"
      >
        <span>☰</span> Filters
        {activeFilterCount > 0 && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1.5 text-[10px] font-bold text-white">
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
            className="buyer-overlay absolute inset-0 backdrop-blur-[2px]"
          />
          <div
            className="buyer-drawer-panel absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="buyer-accent-badge inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold">
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
                className="buyer-btn-primary w-full rounded-xl py-3 text-sm font-bold transition active:scale-[0.99]"
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
