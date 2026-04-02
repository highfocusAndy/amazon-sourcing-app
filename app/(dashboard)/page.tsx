"use client";

import { useSavedProducts } from "@/app/context/SavedProductsContext";
import { useExplorerCategory } from "@/app/context/ExplorerCategoryContext";
import { getSubcategoriesForCategory } from "@/lib/catalogCategories";
import { DashboardHeaderAccount } from "@/app/components/DashboardHeaderAccount";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";
import { AmazonOAuthAlerts } from "@/app/settings/AmazonOAuthAlerts";
import { amazonOfferListingUrl, amazonProductDetailUrl, amazonSellerStorefrontUrl } from "@/lib/marketplaces";
import type { CatalogItem } from "@/lib/spApiClient";
import type { ProductAnalysis, SellerType } from "@/lib/types";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProductSort = "bsr_asc" | "bsr_desc" | "name_asc" | "name_desc";

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
  if (decision === "BUY") return "bg-emerald-900/60 text-emerald-200";
  if (decision === "WORTH UNGATING") return "bg-amber-900/60 text-amber-200";
  if (decision === "LOW_MARGIN") return "bg-orange-900/50 text-orange-200";
  if (decision === "NO_MARGIN" || decision === "BAD") return "bg-rose-900/50 text-rose-200";
  return "bg-slate-700 text-slate-300";
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
    return badReason ?? (item.reasons[0] ?? null);
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

function buildAiInsight(item: ProductAnalysis): string {
  if (item.error) {
    if (/rate limit|QuotaExceeded|wait a few minutes/i.test(item.error))
      return "Amazon's API limit was reached. Wait a few minutes and try again.";
    return "Data connection issue. Re-run and verify account/API credentials.";
  }
  if (item.approvalRequired || item.listingRestricted || item.restrictedBrand)
    return "Listing/gating risk detected. Check approvals before buying.";
  if (item.netProfit === null || item.roiPercent === null || item.buyBoxPrice === null)
    return "Incomplete market data. Validate buy box and fees before deciding.";
  if (item.decision === "BUY") return "Strong candidate. Verify in Seller Central before sourcing.";
  if (item.decision === "WORTH UNGATING") return "Potentially attractive after ungating.";
  if (item.decision === "LOW_MARGIN") return "Margin is thin. Negotiate cost or skip.";
  if (item.decision === "NO_MARGIN") return "No margin or deficit. Do not source.";
  return "Needs deeper review.";
}

function parsePositiveInput(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ExplorerPage() {
  const { addProduct, getByAsin } = useSavedProducts();
  const {
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    clearCategorySelection,
  } = useExplorerCategory();
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [productSort, setProductSort] = useState<ProductSort>("bsr_asc");
  const [bsrMax, setBsrMax] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogNextPageToken, setCatalogNextPageToken] = useState<string | null>(null);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysis | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [panelAnalysisLoading, setPanelAnalysisLoading] = useState(false);
  const [detailPanelCost, setDetailPanelCost] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("FBA");
  const [shippingCost, setShippingCost] = useState("0");
  const [projectedMonthlyUnits, setProjectedMonthlyUnits] = useState("1");
  const [catalogPageSize, setCatalogPageSize] = useState(20);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [ungatedOnly, setUngatedOnly] = useState(false);
  const [eligibilityByAsin, setEligibilityByAsin] = useState<Record<string, boolean | null>>({});
  const [analyzeRequiresAuth, setAnalyzeRequiresAuth] = useState(false);
  const [pendingProductAsin, setPendingProductAsin] = useState<string | null>(null);
  /** Popover on lg+; full-height sheet from the right on smaller screens (mirrors left nav direction). */
  const [sellerModal, setSellerModal] = useState<
    | null
    | { filter: "all" | "FBA" | "FBM"; layout: "sheet" }
    | { filter: "all" | "FBA" | "FBM"; layout: "popover"; top: number; left: number; width: number }
  >(null);
  const [sellerSheetVisible, setSellerSheetVisible] = useState(false);
  const [marketplaceDomain, setMarketplaceDomain] = useState("amazon.com");
  const [loadingPaused, setLoadingPaused] = useState(false);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const eligibilityAbortRef = useRef<AbortController | null>(null);
  const { data: session } = useSession();

  /** Caps explorer catalog requests (server also enforces a max page size). */
  const catalogFetchSize = useMemo(() => Math.min(Math.max(catalogPageSize, 10), 60), [catalogPageSize]);

  const openSellerModal = useCallback((e: React.MouseEvent<HTMLButtonElement>, filter: "all" | "FBA" | "FBM") => {
    const narrow = typeof window !== "undefined" && window.innerWidth < 1024;
    if (narrow) {
      setSellerModal({ filter, layout: "sheet" });
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(320, window.innerWidth - 2 * margin);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    const top = r.bottom + 8;
    setSellerModal({ filter, layout: "popover", top, left, width });
  }, []);

  useEffect(() => {
    setSellerModal(null);
  }, [selectedProduct?.asin]);

  useEffect(() => {
    fetch("/api/config", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { marketplaceDomain?: string }) => {
        if (data.marketplaceDomain) setMarketplaceDomain(data.marketplaceDomain);
      })
      .catch(() => {});
  }, []);

  /** Load user preferences (analysis defaults + catalog page size) once on mount. */
  useEffect(() => {
    fetch("/api/settings/preferences", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { default_seller_type?: "FBA" | "FBM"; default_shipping_cost_fbm?: number; catalog_page_size?: number }) => {
        if (data.default_seller_type === "FBM") setSellerType("FBM");
        if (typeof data.default_shipping_cost_fbm === "number" && data.default_shipping_cost_fbm >= 0)
          setShippingCost(String(data.default_shipping_cost_fbm));
        if (typeof data.catalog_page_size === "number" && data.catalog_page_size >= 10 && data.catalog_page_size <= 100)
          setCatalogPageSize(data.catalog_page_size);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDetailPanelCost("");
  }, [selectedProduct?.id]);

  /** Loads the default “best seller” keyword list (SP-API). Call from Best sellers / Refresh list — not on mount. */
  const loadInitialBestSellers = useCallback(async () => {
    setLoadingPaused(false);
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setCatalogLoading(true);
    setError(null);
    setCatalogNextPageToken(null);
    setEligibilityByAsin({});
    setSelectedProduct(null);
    setDetailPanelCost("");
    try {
      const res = await fetch(
        `/api/catalog/search?q=${encodeURIComponent("best seller")}&pageSize=${catalogFetchSize}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setCatalogResults(json.items ?? []);
      setCatalogNextPageToken(json.nextPageToken ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
        setCatalogLoading(false);
      }
    }
  }, [catalogFetchSize, ungatedOnly]);

  const searchProducts = useCallback(async () => {
    setLoadingPaused(false);
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const parts: string[] = [];
    if (selectedCategory) parts.push(selectedCategory);
    if (selectedSubcategory) parts.push(selectedSubcategory);
    if (keyword.trim()) parts.push(keyword.trim());
    const q = parts.length > 0 ? parts.join(" ") : "best seller";
    setCatalogLoading(true);
    setError(null);
    setAnalyzeRequiresAuth(false);
    setCatalogNextPageToken(null);
    setEligibilityByAsin({});
    setSelectedProduct(null);
    setDetailPanelCost("");
    autoLoadMoreCountRef.current = 0;
    try {
      const res = await fetch(
        `/api/catalog/search?q=${encodeURIComponent(q)}&pageSize=${catalogFetchSize}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      setCatalogResults(json.items ?? []);
      setCatalogNextPageToken(json.nextPageToken ?? null);
      setInfoMessage(
        (json.items ?? []).length === 0
          ? "No products found. Try another subcategory or keyword."
          : null
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setCatalogResults([]);
      setCatalogNextPageToken(null);
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
        setCatalogLoading(false);
      }
    }
  }, [selectedCategory, selectedSubcategory, keyword, catalogFetchSize, ungatedOnly]);

  const loadMoreProducts = useCallback(async () => {
    setLoadingPaused(false);
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const parts: string[] = [];
    if (selectedCategory) parts.push(selectedCategory);
    if (selectedSubcategory) parts.push(selectedSubcategory);
    if (keyword.trim()) parts.push(keyword.trim());
    const q = parts.length > 0 ? parts.join(" ") : "best seller";
    const token = catalogNextPageToken;
    if (!token) return;
    setLoadMoreLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/catalog/search?q=${encodeURIComponent(q)}&pageSize=${catalogFetchSize}&pageToken=${encodeURIComponent(token)}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Search failed.");
      const newItems = json.items ?? [];
      setCatalogResults((prev) => {
        const existingAsins = new Set(prev.map((p) => p.asin));
        const toAppend = newItems.filter((item) => !existingAsins.has(item.asin));
        return toAppend.length === 0 ? prev : [...prev, ...toAppend];
      });
      setCatalogNextPageToken(json.nextPageToken ?? null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load more.");
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
        setLoadMoreLoading(false);
      }
    }
  }, [selectedCategory, selectedSubcategory, keyword, catalogNextPageToken, catalogFetchSize, ungatedOnly]);

  const eligibilityByAsinRef = useRef(eligibilityByAsin);
  eligibilityByAsinRef.current = eligibilityByAsin;

  const ensureEligibilityLoaded = useCallback(
    async (items: CatalogItem[], signal?: AbortSignal) => {
      const missingAsins = Array.from(
        new Set(items.map((i) => i.asin).filter((asin) => eligibilityByAsinRef.current[asin] === undefined)),
      );
      if (missingAsins.length === 0 || signal?.aborted) return;

      // Listings Restrictions API: 5 requests/sec per account. Stay under to avoid 429.
      const REQUEST_BATCH_SIZE = 5;
      const DELAY_MS = 1000;
      const UPDATE_UI_EVERY_PRODUCTS = 25;

      const accumulated: Record<string, boolean | null> = {};
      let processedCount = 0;

      try {
        for (let i = 0; i < missingAsins.length; i += REQUEST_BATCH_SIZE) {
          if (signal?.aborted) return;
          const batch = missingAsins.slice(i, i + REQUEST_BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (asin) => {
              try {
                const res = await fetch(`/api/catalog/restrictions?asin=${encodeURIComponent(asin)}`, {
                  credentials: "same-origin",
                  signal,
                });
                if (!res.ok) return { asin, gated: null as boolean | null };
                const json = (await res.json()) as { gated: boolean | null; asin: string };
                return { asin: json.asin, gated: json.gated };
              } catch (err) {
                if (err != null && typeof (err as { name?: string }).name === "string" && (err as { name: string }).name === "AbortError") return null;
                return { asin, gated: null as boolean | null };
              }
            }),
          );
          const valid = results.filter((r): r is { asin: string; gated: boolean | null } => r !== null);
          if (signal?.aborted) return;
          for (const r of valid) {
            accumulated[r.asin] = r.gated === null ? null : !r.gated;
          }
          processedCount += valid.length;
          // Update UI after every 500 products so user sees results incrementally
          if (processedCount >= UPDATE_UI_EVERY_PRODUCTS || i + REQUEST_BATCH_SIZE >= missingAsins.length) {
            setEligibilityByAsin((prev) => ({ ...prev, ...accumulated }));
            processedCount = 0;
          }
          if (i + REQUEST_BATCH_SIZE < missingAsins.length) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
          }
        }
      } catch (_err) {
        if (signal?.aborted) return;
        // best-effort only; avoid unhandled rejection
      }
    },
    [],
  );

  // When "Ungated only" is on and catalog results change (e.g. user clicks a category), run eligibility
  // for the new results. When user clicks a different category, abort the previous run and start the new one.
  // Effect does NOT depend on ensureEligibilityLoaded so we don't abort after every batch when state updates.
  useEffect(() => {
    if (!ungatedOnly || catalogResults.length === 0 || loadingPaused) return;
    eligibilityAbortRef.current?.abort();
    const controller = new AbortController();
    eligibilityAbortRef.current = controller;
    ensureEligibilityLoaded(catalogResults, controller.signal).catch(() => {});
    return () => {
      controller.abort();
      if (eligibilityAbortRef.current === controller) {
        eligibilityAbortRef.current = null;
      }
    };
  }, [ungatedOnly, catalogResults, loadingPaused]);

  /** When "Ungated only" is on and no category is selected, auto-load a few more catalog pages (capped to limit SP-API GETs). */
  const ungatedAutoLoadCountRef = useRef(0);
  useEffect(() => {
    if (!ungatedOnly || selectedCategory || selectedSubcategory) {
      ungatedAutoLoadCountRef.current = 0;
      return;
    }
    if (
      catalogResults.length === 0 ||
      catalogResults.length >= 120 ||
      !catalogNextPageToken ||
      loadMoreLoading ||
      catalogLoading ||
      loadingPaused ||
      ungatedAutoLoadCountRef.current >= 8
    ) {
      return;
    }
    ungatedAutoLoadCountRef.current += 1;
    loadMoreProducts();
  }, [
    ungatedOnly,
    selectedCategory,
    selectedSubcategory,
    catalogResults.length,
    catalogNextPageToken,
    loadMoreLoading,
    catalogLoading,
    loadingPaused,
    loadMoreProducts,
  ]);

  /** When "Ungated only" is on AND a category (or subcategory) is selected, auto-load catalog up to a modest cap to limit restriction API volume. */
  const CATEGORY_SCAN_CAP = 240;
  useEffect(() => {
    if (
      !ungatedOnly ||
      (!selectedCategory && !selectedSubcategory) ||
      catalogResults.length === 0 ||
      catalogResults.length >= CATEGORY_SCAN_CAP ||
      !catalogNextPageToken ||
      loadMoreLoading ||
      catalogLoading ||
      loadingPaused
    ) {
      return;
    }
    loadMoreProducts();
  }, [
    ungatedOnly,
    selectedCategory,
    selectedSubcategory,
    catalogResults.length,
    catalogNextPageToken,
    loadMoreLoading,
    catalogLoading,
    loadingPaused,
    loadMoreProducts,
  ]);

  /** When "BSR low first" and a subcategory is selected, auto-load up to 3 more pages. Do NOT auto-load for best sellers (no subcategory). */
  useEffect(() => {
    if (
      !selectedSubcategory ||
      productSort !== "bsr_asc" ||
      !catalogNextPageToken ||
      loadMoreLoading ||
      catalogLoading ||
      loadingPaused ||
      catalogResults.length === 0 ||
      catalogResults.length >= 120 ||
      autoLoadMoreCountRef.current >= 2
    ) {
      return;
    }
    loadMoreProducts().then(() => {
      autoLoadMoreCountRef.current += 1;
    });
  }, [
    selectedSubcategory,
    productSort,
    catalogNextPageToken,
    loadMoreLoading,
    catalogLoading,
    loadingPaused,
    catalogResults.length,
    loadMoreProducts,
  ]);

  const searchProductsRef = useRef(searchProducts);
  searchProductsRef.current = searchProducts;

  /** When "BSR low first" is selected, we auto-load up to 3 more pages so the list can start from top BSR. */
  const autoLoadMoreCountRef = useRef(0);
  const [showAmazonAccountModal, setShowAmazonAccountModal] = useState(false);
  const [amazonHeaderConnected, setAmazonHeaderConnected] = useState(false);
  const [amazonHeaderTitle, setAmazonHeaderTitle] = useState<string | null>(null);

  const productTableContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedSubcategory) {
      searchProductsRef.current();
    }
  }, [selectedSubcategory]);

  const filteredAndSortedProducts = useMemo(() => {
    const seenAsins = new Set<string>();
    const list = catalogResults.filter((p) => {
      if (seenAsins.has(p.asin)) return false;
      seenAsins.add(p.asin);
      return true;
    });
    const bsrMaxNum = bsrMax.trim() ? parseInt(bsrMax.replace(/,/g, ""), 10) : null;
    let filtered = Number.isFinite(bsrMaxNum!) && bsrMaxNum! > 0
      ? list.filter((p) => p.rank != null && p.rank <= bsrMaxNum!)
      : list;

    // When "Ungated only" is on, show only products confirmed ungated (API returned not gated).
    // Do not show gated or unknown (API error/not loaded) to avoid showing gated products by mistake.
    if (ungatedOnly) {
      filtered = filtered.filter((p) => eligibilityByAsin[p.asin] === true);
    }
    if (productSort === "bsr_asc") filtered.sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
    else if (productSort === "bsr_desc") filtered.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
    else if (productSort === "name_asc") filtered.sort((a, b) => (a.title || a.asin).localeCompare(b.title || b.asin));
    else if (productSort === "name_desc") filtered.sort((a, b) => (b.title || b.asin).localeCompare(a.title || a.asin));
    return filtered;
  }, [catalogResults, bsrMax, productSort, ungatedOnly, eligibilityByAsin]);

  const eligibilityStillChecking = useMemo(() => {
    if (!ungatedOnly || catalogResults.length === 0) return false;
    const asins = catalogResults.map((p) => p.asin);
    return asins.some((asin) => eligibilityByAsin[asin] === undefined);
  }, [ungatedOnly, catalogResults, eligibilityByAsin]);

  const eligibilityStats = useMemo(() => {
    if (catalogResults.length === 0) return { checked: 0, ungated: 0 };
    const asins = catalogResults.map((p) => p.asin);
    let checked = 0;
    let ungated = 0;
    for (const asin of asins) {
      const v = eligibilityByAsin[asin];
      if (v !== undefined) checked += 1;
      if (v === true) ungated += 1;
    }
    return { checked, ungated };
  }, [catalogResults, eligibilityByAsin]);

  const handleProductClick = useCallback(
    async (item: CatalogItem) => {
      setPendingProductAsin(item.asin);
      setPanelAnalysisLoading(true);
      setMobileDetailsOpen(true);
      setError(null);
      setAnalyzeRequiresAuth(false);
      const cached = getByAsin(item.asin);
      if (cached) {
        setSelectedProduct(cached);
        setInfoMessage(null);
        setPendingProductAsin(null);
        setPanelAnalysisLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identifier: item.asin,
            wholesalePrice: 0,
            brand: item.brand || undefined,
            projectedMonthlyUnits: parsePositiveInput(projectedMonthlyUnits) ?? 1,
            sellerType,
            shippingCost: sellerType === "FBM" ? Number(shippingCost) : 0,
          }),
        });
        const json = (await res.json()) as { error?: string; result?: ProductAnalysis };
        if (!res.ok) {
          if (res.status === 401) {
            setAnalyzeRequiresAuth(true);
            setError("Sign in to view product details and eligibility.");
          } else {
            setError(json?.error ?? "Analysis failed.");
          }
          setPendingProductAsin(null);
          return;
        }
        if (!json.result) {
          setError(json?.error ?? "Analysis failed.");
          setPendingProductAsin(null);
          return;
        }
        const result = json.result as ProductAnalysis;
        addProduct(result);
        setSelectedProduct(result);
        setDetailPanelCost("");
        setPendingProductAsin(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load product.");
        setPendingProductAsin(null);
      } finally {
        setPanelAnalysisLoading(false);
      }
    },
    [getByAsin, addProduct, projectedMonthlyUnits, sellerType, shippingCost]
  );

  const subcategories = selectedCategory ? getSubcategoriesForCategory(selectedCategory) : [];

  const showProductTable = true;

  const explorerLoading = catalogLoading || loadMoreLoading || (!loadingPaused && eligibilityStillChecking);
  const cancelExplorerLoading = useCallback(() => {
    setLoadingPaused(true);
    catalogAbortRef.current?.abort();
    eligibilityAbortRef.current?.abort();
    setCatalogLoading(false);
    setLoadMoreLoading(false);
  }, []);

  const refreshAmazonHeaderStatus = useCallback(() => {
    if (!session?.user) {
      setAmazonHeaderConnected(false);
      setAmazonHeaderTitle(null);
      return;
    }
    fetch("/api/settings/amazon-account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.connected) {
          setAmazonHeaderConnected(true);
          const title =
            (data.storeName as string | undefined)?.trim() ||
            (data.connectionLabel as string | undefined) ||
            (data.emailMasked as string | undefined) ||
            "Amazon linked";
          setAmazonHeaderTitle(title);
        } else {
          setAmazonHeaderConnected(false);
          setAmazonHeaderTitle(null);
        }
      })
      .catch(() => {
        setAmazonHeaderConnected(false);
        setAmazonHeaderTitle(null);
      });
  }, [session?.user]);

  useEffect(() => {
    refreshAmazonHeaderStatus();
  }, [refreshAmazonHeaderStatus]);

  useEffect(() => {
    if (!mobileDetailsOpen) return;
    const mq = window.matchMedia("(max-width: 1023px)");
    if (!mq.matches) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [mobileDetailsOpen]);

  useEffect(() => {
    if (!sellerModal || sellerModal.layout !== "sheet") {
      setSellerSheetVisible(false);
      return;
    }
    setSellerSheetVisible(false);
    let innerId = 0;
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => setSellerSheetVisible(true));
    });
    return () => {
      cancelAnimationFrame(outerId);
      cancelAnimationFrame(innerId);
    };
  }, [sellerModal]);

  useEffect(() => {
    if (!sellerModal || sellerModal.layout !== "sheet") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sellerModal]);

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      {showAmazonAccountModal && (
        <AmazonAccountModal
          onClose={() => setShowAmazonAccountModal(false)}
        />
      )}
      <Suspense fallback={null}>
        <AmazonOAuthAlerts />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4 pb-10 sm:gap-6 sm:p-6 sm:pb-10">
        <header className="sticky top-0 z-20 shrink-0 rounded-xl border border-slate-600/80 bg-slate-800/95 px-3 py-3 shadow-lg shadow-black/10 border-t-4 border-t-teal-500 backdrop-blur sm:px-4 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="hidden min-w-0 items-center gap-2 sm:gap-3 md:flex">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <img
                  src="/HF_LOGO.png"
                  alt="HIGH FOCUS Professional"
                  className="h-9 w-auto shrink-0 brightness-0 invert sm:h-12"
                />
                <h1 className="min-w-0 truncate text-base font-bold text-slate-100 tracking-tight sm:text-lg sm:whitespace-normal">
                  HIGH FOCUS Sourcing App
                </h1>
              </div>
            </div>
            <DashboardHeaderAccount
              session={session}
              amazonConnected={amazonHeaderConnected}
              accountTitle={amazonHeaderTitle}
              onConnectAmazon={() => setShowAmazonAccountModal(true)}
              onAmazonDisconnected={refreshAmazonHeaderStatus}
            />
          </div>
        </header>

        {/* Filters: Keyword, Sort, BSR max, Ungated */}
        <section className="shrink-0 rounded-xl border border-slate-600/80 bg-slate-800/90 px-4 py-3 shadow-lg shadow-black/10">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400">
              Sort
              <select
                value={productSort}
                onChange={(e) => setProductSort(e.target.value as ProductSort)}
                className="rounded-lg border border-slate-600 bg-slate-700/50 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
              >
                <option value="bsr_asc">BSR low first</option>
                <option value="bsr_desc">BSR high first</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              BSR max
              <input
                type="text"
                value={bsrMax}
                onChange={(e) => setBsrMax(e.target.value)}
                placeholder="e.g. 100000"
                className="w-24 rounded-lg border border-slate-600 bg-slate-700/50 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400" title="Only products confirmed ungated for your account (Amazon Listings Restrictions API). Sign in and wait for checks to finish.">
              <input
                type="checkbox"
                checked={ungatedOnly}
                onChange={(e) => {
                  const next = e.target.checked;
                  setLoadingPaused(false);
                  setUngatedOnly(next);
                }}
                className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-teal-500 focus:ring-teal-500/50"
              />
              <span>Ungated only (your account)</span>
            </label>
            {ungatedOnly && (
              <span className="text-xs text-slate-500">
                Only confirmed ungated; sign in and wait for checks.
              </span>
            )}
            {selectedCategory && selectedSubcategory && (
              <button
                type="button"
                onClick={() => searchProducts()}
                disabled={catalogLoading}
                className="rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-50 transition-all"
              >
                {catalogLoading ? "…" : "Refresh"}
              </button>
            )}
            {selectedCategory ? (
              <button
                type="button"
                onClick={() => {
                  clearCategorySelection();
                  setKeyword("");
                  setCatalogResults([]);
                  setCatalogNextPageToken(null);
                  setInfoMessage(null);
                  setProductSort("bsr_asc");
                  loadInitialBestSellers();
                }}
                className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600"
              >
                Best sellers
              </button>
            ) : (
              <button
                type="button"
                onClick={() => loadInitialBestSellers()}
                disabled={catalogLoading}
                className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              >
                {catalogLoading ? "…" : "Refresh list"}
              </button>
            )}
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-rose-800 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
            {error}
            {analyzeRequiresAuth && (
              <p className="mt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-500"
                >
                  Sign in
                </Link>
              </p>
            )}
          </div>
        ) : null}
        {infoMessage ? (
          <div className="shrink-0 rounded-lg border border-emerald-800 bg-emerald-900/30 px-4 py-3 text-sm text-emerald-300">
            {infoMessage}
          </div>
        ) : null}

        {/* Product table - Product, Brand, BSR only; fit middle without horizontal scroll */}
        {showProductTable && (
          <section
            ref={productTableContainerRef}
            className="flex min-w-0 flex-col rounded-xl border border-slate-600/80 bg-slate-800/90 shadow-lg shadow-black/10"
          >
            <div className="border-b border-slate-600/80 px-3 py-2.5 flex flex-col gap-0.5 bg-slate-800/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">
                  {selectedCategory && selectedSubcategory
                    ? `${selectedCategory} › ${selectedSubcategory}`
                    : ungatedOnly
                      ? "Ungated list"
                      : "Best Sellers"}
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                  {explorerLoading ? (
                    <svg className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-label="Loading">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity={0.25} />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity={0.9} />
                    </svg>
                  ) : null}
                  {explorerLoading ? (
                    <button
                      type="button"
                      onClick={cancelExplorerLoading}
                      className="rounded border border-slate-600 px-1 text-[10px] leading-4 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                      aria-label="Cancel loading"
                      title="Cancel loading"
                    >
                      x
                    </button>
                  ) : null}
                  <p>
                    {filteredAndSortedProducts.length} products
                    {catalogNextPageToken ? " · Load more below" : ""}
                  </p>
                </div>
              </div>
              {(selectedCategory || selectedSubcategory) && ungatedOnly && (
                <p className="text-[10px] text-slate-500">
                  {catalogLoading || loadMoreLoading ? (
                    <>Loading up to 1,000 products in this category, then checking eligibility…</>
                  ) : eligibilityStillChecking ? (
                    eligibilityStats.checked > 0 ? (
                      <>Checking eligibility… {eligibilityStats.checked} checked, <span className="text-slate-300 font-medium">{eligibilityStats.ungated} ungated</span> so far.</>
                    ) : (
                      <>Checking eligibility…</>
                    )
                  ) : (
                    <>Ungated in this category. {eligibilityStats.checked} checked, {eligibilityStats.ungated} ungated.</>
                  )}
                </p>
              )}
              {!selectedCategory && !selectedSubcategory && ungatedOnly && (
                <p className="text-[10px] text-slate-500">
                  {eligibilityStillChecking ? (
                    eligibilityStats.checked > 0 ? (
                      <>Results update after each 500 products. {eligibilityStats.checked} checked, <span className="text-slate-300 font-medium">{eligibilityStats.ungated} ungated</span> so far.</>
                    ) : (
                      <>Checking eligibility…</>
                    )
                  ) : (
                    <>Products confirmed ungated for your account. {eligibilityStats.checked} checked, {eligibilityStats.ungated} ungated.</>
                  )}
                </p>
              )}
              {!selectedCategory && !selectedSubcategory && !ungatedOnly && (
                <p className="text-[10px] text-slate-500">
                  {catalogResults.length === 0 && !catalogLoading ? (
                    <>
                      Use <span className="text-slate-400 font-medium">Best sellers</span> /{" "}
                      <span className="text-slate-400 font-medium">Refresh list</span>, a category, or a keyword to load
                      products from Amazon.
                    </>
                  ) : (
                    <>
                      Keyword search results, sorted by BSR. Amazon does not provide a true “top by rank” list; some
                      high-BSR products may not appear.
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-700/50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="w-[60%] px-2 py-2">Product</th>
                    <th className="w-[20%] px-2 py-2">Brand</th>
                    <th className="w-[20%] px-2 py-2">BSR</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-6 text-center text-slate-500 text-sm">
                        {catalogLoading ? (
                          "Loading…"
                        ) : ungatedOnly && catalogResults.length > 0 ? (
                          <span>
                            {eligibilityStillChecking ? (
                              <>Checking eligibility… Sign in to check. Or uncheck &quot;Ungated only&quot; to see all products.</>
                            ) : (
                              <>
                                No products confirmed ungated for your account.{" "}
                                {session?.user ? (
                                  selectedCategory || selectedSubcategory ? (
                                    "Uncheck \"Ungated only\" to see all products, or try another category."
                                  ) : (
                                    "Uncheck \"Ungated only\" to see all products, or click Refresh list above to load a new set."
                                  )
                                ) : (
                                  <>
                                    <Link href="/login" className="text-teal-400 hover:text-teal-300 underline">Sign in</Link>
                                    {" "}to check eligibility, or uncheck \"Ungated only\" to see all products.
                                  </>
                                )}
                              </>
                            )}
                          </span>
                        ) : (
                          "No products. Pick a category or use Best sellers."
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedProducts.map((item) => (
                      <tr
                        key={item.asin}
                        onClick={() => handleProductClick(item)}
                        className={`cursor-pointer border-t border-slate-700 transition hover:bg-slate-700/30 ${
                          selectedProduct?.asin === item.asin || pendingProductAsin === item.asin
                            ? "bg-sky-500/20 ring-inset ring-1 ring-sky-400"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-7 w-7 shrink-0 rounded border border-slate-600 object-contain"
                              />
                            ) : (
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-700 text-slate-500 text-[8px]">—</span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-200 text-[11px]" title={item.title}>{item.title || item.asin}</p>
                              <p className="text-[9px] text-slate-500 truncate">{item.asin}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-slate-300 text-[11px] truncate" title={item.brand ?? undefined}>{item.brand || "—"}</td>
                        <td className="px-2 py-1 text-slate-300 text-[11px]">{formatNumber(item.rank)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {catalogNextPageToken && !catalogLoading ? (
              <div className="flex justify-center border-t border-slate-700 px-3 py-2">
                <button
                  type="button"
                  onClick={() => loadMoreProducts()}
                  disabled={loadMoreLoading}
                  className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {loadMoreLoading ? "Loading…" : ungatedOnly ? "Load next 500" : "Load next 30"}
                </button>
              </div>
            ) : null}
          </section>
        )}
      </main>

      {mobileDetailsOpen ? (
        <button
          type="button"
          aria-label="Close product details"
          className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileDetailsOpen(false)}
        />
      ) : null}

      {/* Right panel: overlay sheet on small screens; in-flow column on lg+ so the page does not scroll under it */}
      <aside
        className={`fixed flex min-h-0 flex-col border-l border-slate-700 bg-slate-800 shadow-xl transition-transform duration-300 ease-out max-lg:inset-x-0 max-lg:top-0 max-lg:z-[100] max-lg:h-[100svh] max-lg:max-h-[100svh] max-lg:w-full max-lg:max-w-none ${
          mobileDetailsOpen ? "max-lg:translate-x-0" : "max-lg:pointer-events-none max-lg:translate-x-full"
        } lg:static lg:z-auto lg:h-full lg:max-h-full lg:w-80 lg:shrink-0 lg:translate-x-0 xl:w-96`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3 max-lg:py-0 max-lg:pb-3 max-lg:pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <h3 className="text-base font-semibold text-slate-100">Product details</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileDetailsOpen(false)}
              className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-600 lg:hidden"
            >
              Back
            </button>
            {selectedProduct ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedProduct(null);
                  setDetailPanelCost("");
                  setMobileDetailsOpen(false);
                }}
                className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-600"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4 pt-3 text-[13px] text-slate-200 lg:p-4">
          {panelAnalysisLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-400">
              <p className="font-medium">Loading…</p>
              <p className="text-xs">Fetching product data and eligibility.</p>
            </div>
          ) : !selectedProduct ? (
            <div className="flex flex-col gap-4 text-sm text-slate-400">
              <div className="flex h-20 w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-700/30 text-slate-500">
                <span className="text-3xl">—</span>
              </div>
              <p className="font-medium text-slate-200">No product selected</p>
              <p className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-3 text-slate-400">
                Select a category, then click a product in the table to view details and selling eligibility.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {["BSR", "Buy box", "FBA / FBM", "Cost", "Profit", "ROI"].map((label) => (
                  <div key={label} className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="font-semibold text-slate-500">—</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 bg-slate-800 pb-2">
                {selectedProduct.imageUrl ? (
                  selectedProduct.asin ? (
                    <a
                      href={amazonOfferListingUrl(marketplaceDomain, selectedProduct.asin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="See all sellers on Amazon for this product"
                      className="block rounded-lg outline-none ring-offset-2 ring-offset-slate-800 focus-visible:ring-2 focus-visible:ring-teal-400"
                    >
                      <img
                        src={selectedProduct.imageUrl}
                        alt={selectedProduct.title || "Product"}
                        referrerPolicy="no-referrer"
                        className="h-32 w-full rounded-lg border border-slate-600 object-contain bg-slate-700/30 transition hover:border-slate-500"
                      />
                    </a>
                  ) : (
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.title || "Product"}
                      referrerPolicy="no-referrer"
                      className="h-32 w-full rounded-lg border border-slate-600 object-contain bg-slate-700/30"
                    />
                  )
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-700/30 text-slate-500">—</div>
                )}
                <div>
                  {selectedProduct.asin ? (
                    <a
                      href={amazonOfferListingUrl(marketplaceDomain, selectedProduct.asin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="See all sellers on Amazon for this product"
                      className="font-medium text-slate-100 underline decoration-slate-500 underline-offset-2 transition hover:text-teal-300 hover:decoration-teal-300"
                    >
                      {selectedProduct.title || selectedProduct.asin || "Product"}
                    </a>
                  ) : (
                    <p className="font-medium text-slate-100">{selectedProduct.title || selectedProduct.asin || "Product"}</p>
                  )}
                  {selectedProduct.asin ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      <a
                        href={amazonProductDetailUrl(marketplaceDomain, selectedProduct.asin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200 hover:decoration-slate-400"
                      >
                        Open product page on Amazon
                      </a>
                    </p>
                  ) : null}
                  {selectedProduct.offerLabel ? (
                    <p className="text-sm text-teal-400">Listing: {selectedProduct.offerLabel}</p>
                  ) : null}
                  {selectedProduct.brand ? <p className="text-sm text-slate-400">Brand: {selectedProduct.brand}</p> : null}
                  {selectedProduct.asin ? <p className="text-xs text-slate-500">ASIN: {selectedProduct.asin}</p> : null}
                  {selectedProduct.salesRankCategory ? <p className="text-xs text-slate-500">Category: {selectedProduct.salesRankCategory}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClasses(selectedProduct.decision)}`}>
                    {decisionDisplayLabel(selectedProduct.decision)}
                  </span>
                  {(() => {
                    const explanation = decisionExplanation(selectedProduct);
                    return explanation ? <span className="text-sm text-slate-400">— {explanation}</span> : null;
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gated / Eligible</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {selectedProduct.approvalRequired === true ? (
                    <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-200">Approval required</span>
                  ) : selectedProduct.approvalRequired === false ? (
                    <span className="rounded bg-slate-600/60 px-2 py-0.5 text-xs text-slate-300">No approval required</span>
                  ) : null}
                  {selectedProduct.listingRestricted === true ? (
                    <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs font-medium text-amber-200">Listing restricted</span>
                  ) : selectedProduct.listingRestricted === false ? (
                    <span className="rounded bg-slate-600/60 px-2 py-0.5 text-xs text-slate-300">Not restricted</span>
                  ) : null}
                  {selectedProduct.approvalRequired == null && selectedProduct.listingRestricted == null ? (
                    <span className="text-xs text-slate-500">—</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-700 pt-4">
                <div className="space-y-3 rounded-xl border border-teal-500/35 bg-slate-800/70 p-3 shadow-sm shadow-teal-900/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-400/90">Sourcing snapshot</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-2.5 py-1.5">
                      <p className="text-xs text-slate-500">
                        BSR
                        {selectedProduct.salesRankCategory ? ` · ${selectedProduct.salesRankCategory}` : ""}
                      </p>
                      <p className="text-base font-semibold text-slate-100">
                        {selectedProduct.salesRank != null ? formatNumber(selectedProduct.salesRank) : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-2.5 py-1.5">
                      <p className="text-xs text-slate-500">Buy box</p>
                      <p className="text-base font-semibold text-slate-100">{formatCurrency(selectedProduct.buyBoxPrice)}</p>
                    </div>
                  </div>

                  <div className="flex rounded-lg border border-slate-600 bg-slate-700/30 p-1">
                    <button
                      type="button"
                      onClick={() => setSellerType("FBA")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${sellerType === "FBA" ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      FBA
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellerType("FBM")}
                      className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${sellerType === "FBM" ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      FBM
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Your cost</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={detailPanelCost}
                      onChange={(e) => setDetailPanelCost(e.target.value)}
                      placeholder="Enter your cost"
                      className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
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
                        onChange={(e) => setShippingCost(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Units (for total buy &amp; projected profit)</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={projectedMonthlyUnits}
                      onChange={(e) => setProjectedMonthlyUnits(e.target.value)}
                      className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Profit</p>
                      <p className="font-semibold text-slate-100">
                        {detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost)) && selectedProduct.buyBoxPrice != null && selectedProduct.totalFees != null
                          ? formatCurrency(roundToTwo(selectedProduct.buyBoxPrice - parseFloat(detailPanelCost) - selectedProduct.totalFees))
                          : formatCurrency(selectedProduct.netProfit)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">ROI</p>
                      <p className="font-semibold text-slate-100">
                        {detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost)) && parseFloat(detailPanelCost) > 0 && selectedProduct.buyBoxPrice != null && selectedProduct.totalFees != null
                          ? formatPercent(roundToTwo(((selectedProduct.buyBoxPrice - parseFloat(detailPanelCost) - selectedProduct.totalFees) / parseFloat(detailPanelCost)) * 100))
                          : formatPercent(selectedProduct.roiPercent)}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Margin</p>
                      <p className="font-semibold text-slate-100">
                        {(() => {
                          const buyBox = selectedProduct.buyBoxPrice;
                          const netP =
                            detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost)) && selectedProduct.buyBoxPrice != null && selectedProduct.totalFees != null
                              ? roundToTwo(selectedProduct.buyBoxPrice - parseFloat(detailPanelCost) - selectedProduct.totalFees)
                              : selectedProduct.netProfit;
                          if (buyBox != null && buyBox > 0 && netP != null) return formatPercent(roundToTwo((netP / buyBox) * 100));
                          return formatPercent(null);
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Wholesale / stored cost</p>
                      <p className="font-semibold text-slate-100">
                        {detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
                          ? formatCurrency(parseFloat(detailPanelCost))
                          : formatCurrency(selectedProduct.wholesalePrice)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Fees (ref / {selectedProduct.sellerType === "FBA" ? "FBA" : "FBM ship"})</p>
                      <p className="font-semibold text-slate-100">{formatCurrency(selectedProduct.totalFees)}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        Ref {formatCurrency(selectedProduct.referralFee)}
                        {selectedProduct.sellerType === "FBA" ? ` · FBA ${formatCurrency(selectedProduct.fbaFee)}` : ` · Ship ${formatCurrency(selectedProduct.shippingCost)}`}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Total buy cost ({projectedMonthlyUnits} units)</p>
                      <p className="font-semibold text-slate-100">
                        {(() => {
                          const qty = parsePositiveInput(projectedMonthlyUnits);
                          const cost =
                            detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
                              ? parseFloat(detailPanelCost)
                              : selectedProduct.wholesalePrice;
                          return qty !== null ? formatCurrency(roundToTwo(cost * qty)) : "—";
                        })()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                      <p className="text-xs text-slate-500">Projected profit ({projectedMonthlyUnits} × net profit)</p>
                      <p className="font-semibold text-slate-100">
                        {(() => {
                          const qty = parsePositiveInput(projectedMonthlyUnits);
                          const cost =
                            detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
                              ? parseFloat(detailPanelCost)
                              : selectedProduct.wholesalePrice;
                          const netP =
                            selectedProduct.buyBoxPrice != null && selectedProduct.totalFees != null
                              ? roundToTwo(selectedProduct.buyBoxPrice - cost - selectedProduct.totalFees)
                              : selectedProduct.netProfit;
                          return netP != null && qty !== null ? formatCurrency(roundToTwo(netP * qty)) : "—";
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {(selectedProduct.approvalRequired || selectedProduct.listingRestricted || selectedProduct.restrictedBrand) ? (
                  <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ungating</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {selectedProduct.worthUngating != null && (
                        <li className="flex justify-between gap-2">
                          <span className="text-slate-400">Worth ungating</span>
                          <span className={selectedProduct.worthUngating ? "font-medium text-emerald-300" : "text-slate-300"}>{selectedProduct.worthUngating ? "Yes" : "No"}</span>
                        </li>
                      )}
                      {selectedProduct.ungatingCost10Units != null && (
                        <li className="flex justify-between gap-2">
                          <span className="text-slate-400">Cost (10 units)</span>
                          <span className="text-slate-200">{formatCurrency(selectedProduct.ungatingCost10Units)}</span>
                        </li>
                      )}
                      {selectedProduct.breakEvenUnits != null && (
                        <li className="flex justify-between gap-2">
                          <span className="text-slate-400">Break-even units</span>
                          <span className="text-slate-200">{formatNumber(selectedProduct.breakEvenUnits)}</span>
                        </li>
                      )}
                      {selectedProduct.projectedMonthlyProfit != null && (
                        <li className="flex justify-between gap-2">
                          <span className="text-slate-400">Projected monthly profit</span>
                          <span className="text-slate-200">{formatCurrency(selectedProduct.projectedMonthlyProfit)}</span>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : null}

                {selectedProduct.amazonSalesVolumeLabel ? (
                  <div className="rounded-lg border border-slate-600 bg-emerald-900/30 px-3 py-2">
                    <p className="text-xs text-slate-500">Product sells (from Amazon)</p>
                    <p className="font-semibold text-slate-100">{selectedProduct.amazonSalesVolumeLabel}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Extracted from product page when available.</p>
                  </div>
                ) : null}

                {(selectedProduct.offerCount != null || selectedProduct.fbaOfferCount != null || selectedProduct.fbmOfferCount != null) ? (
                  <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                    <p className="text-xs text-slate-500">Listing (offers)</p>
                    <p className="text-sm font-medium text-slate-100">
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
                      ) : "—"}
                      {selectedProduct.fbaOfferCount != null || selectedProduct.fbmOfferCount != null ? (
                        <span className="text-slate-400">
                          {" "}(FBA:{" "}
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
                    </p>
                  </div>
                ) : null}

                {(() => {
                  const codes = selectedProduct.restrictionReasonCodes;
                  const hasHazmat = codes.some((c) => /HAZMAT|HAZARD|DANGEROUS/i.test(c));
                  const hasVariation = codes.some((c) => /VARIATION|VAR\b|PARENT_CHILD/i.test(c));
                  return (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                        <p className="text-xs text-slate-500">IP / complaint risk</p>
                        <p className="text-sm font-medium text-slate-100">{selectedProduct.ipComplaintRisk ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                        <p className="text-xs text-slate-500">Meltable</p>
                        <p className="text-sm font-medium text-slate-100">{selectedProduct.meltableRisk ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                        <p className="text-xs text-slate-500">Hazmat</p>
                        <p className="text-sm font-medium text-slate-100">{hasHazmat ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-amber-900/50 bg-amber-900/20 px-3 py-2">
                        <p className="text-xs text-slate-500">Private label (possible)</p>
                        <p className="text-sm font-medium text-slate-100">{selectedProduct.privateLabelRisk ? "Yes" : "No"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2">
                        <p className="text-xs text-slate-500">Variation</p>
                        <p className="text-sm font-medium text-slate-100">{hasVariation ? "Yes" : "No"}</p>
                      </div>
                    </div>
                  );
                })()}

                {selectedProduct.reasons.length > 0 ||
                selectedProduct.restrictionReasonCodes.length > 0 ||
                selectedProduct.error ||
                selectedProduct.listingRestricted ||
                selectedProduct.approvalRequired ||
                selectedProduct.restrictedBrand ? (
                  <div className="rounded-lg border border-amber-900/50 bg-amber-900/20 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-200">Alerts / Amazon info</p>
                    {selectedProduct.error ? <p className="mt-1 text-sm text-rose-300">{selectedProduct.error}</p> : null}
                    {selectedProduct.restrictedBrand ? <p className="mt-1 text-xs text-amber-300">Restricted brand list</p> : null}
                    {selectedProduct.listingRestricted ? <p className="mt-1 text-xs text-amber-300">Listing restricted</p> : null}
                    {selectedProduct.approvalRequired ? <p className="mt-1 text-xs text-amber-300">Approval required</p> : null}
                    {selectedProduct.restrictionReasonCodes.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-300">Codes: {selectedProduct.restrictionReasonCodes.join(", ")}</p>
                    ) : null}
                    {selectedProduct.reasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-200">
                        {selectedProduct.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <p className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2 text-sm text-slate-300">
                  <span className="font-semibold text-slate-100">AI: </span>
                  {buildAiInsight(selectedProduct)}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
      </div>

      {sellerModal && selectedProduct?.sellerDetails && (selectedProduct.sellerDetails ?? []).length > 0 ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[110] bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setSellerModal(null)}
            aria-label="Close sellers list"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sellers list"
            className={
              sellerModal.layout === "sheet"
                ? `fixed inset-y-0 right-0 z-[115] flex max-h-[100svh] w-[min(100vw,24rem)] flex-col overflow-hidden border-l border-slate-600 bg-slate-800 shadow-2xl transition-transform duration-300 ease-out ${
                    sellerSheetVisible ? "translate-x-0" : "translate-x-full pointer-events-none"
                  }`
                : "fixed z-[115] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-800 shadow-xl"
            }
            style={
              sellerModal.layout === "popover"
                ? {
                    top: sellerModal.top,
                    left: sellerModal.left,
                    width: sellerModal.width,
                    maxHeight: Math.min(window.innerHeight * 0.65, window.innerHeight - sellerModal.top - 8),
                  }
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-600 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {sellerModal.filter === "all"
                    ? "Sellers"
                    : sellerModal.filter === "FBA"
                      ? "FBA sellers"
                      : "FBM sellers"}
                </h3>
                <button
                  type="button"
                  onClick={() => setSellerModal(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">
                {sellerModal.layout === "sheet"
                  ? "Opens from the right (main menu opens from the left). Tap outside or × to close. Tap a seller for their Amazon storefront."
                  : "Opens next to this control. Click a seller to open their Amazon storefront in a new tab. Display names show only when Amazon includes them on the offer."}
              </p>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
              {(sellerModal.filter === "all"
                ? (selectedProduct.sellerDetails ?? [])
                : (selectedProduct.sellerDetails ?? []).filter((s) => s.channel === sellerModal.filter)
              ).map((s, i) => (
                <li key={`${s.sellerId}-${i}`} className="mb-2 last:mb-0">
                  <a
                    href={amazonSellerStorefrontUrl(marketplaceDomain, s.sellerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col gap-1 rounded-lg border border-slate-600/80 bg-slate-700/50 px-3 py-2 text-xs outline-none transition hover:border-slate-500 hover:bg-slate-600/45 focus-visible:ring-2 focus-visible:ring-teal-400"
                              title={`View products from seller ${s.sellerId} on Amazon`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {s.sellerDisplayName ? (
                          <span className="block truncate font-medium text-slate-100">{s.sellerDisplayName}</span>
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
                      <span className="shrink-0 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {s.channel}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-slate-400">
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {s.feedbackCount != null && (
                          <span title="Feedback count">{s.feedbackCount.toLocaleString()} feedback</span>
                        )}
                        {s.feedbackPercent != null && (
                          <span title="Positive feedback %">{s.feedbackPercent}% positive</span>
                        )}
                        {s.feedbackCount == null && s.feedbackPercent == null && <span>—</span>}
                      </span>
                                <span className="shrink-0 text-[10px] font-medium text-teal-400/90">All listings ↗</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
