"use client";
/* eslint-disable @next/next/no-img-element */

import { useSavedProducts } from "@/app/context/SavedProductsContext";
import { useExplorerCategory } from "@/app/context/ExplorerCategoryContext";
import { DashboardHeaderAccount } from "@/app/components/DashboardHeaderAccount";
import { DashboardHeaderMark } from "@/app/components/DashboardHeaderMark";
import { ProductIntelPanelContent } from "@/app/components/ProductIntelPanelContent";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";
import { AmazonOAuthQueryCleanup } from "@/app/settings/AmazonOAuthQueryCleanup";
import { appHeaderCompact, appHeaderSuffix } from "@/lib/appBranding";
import type { CatalogItem } from "@/lib/spApiClient";
import type { ProductAnalysis, SellerType } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SellerListDialog, buildSellerModalState, type SellerModalState } from "@/app/components/SellerListDialog";
import { useSession } from "next-auth/react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProductSort = "bsr_asc" | "bsr_desc" | "name_asc" | "name_desc";

/** Listings Restrictions API: gated true = gated, false = eligible. Unknown / not connected → null (never assume ungated). */
function eligibilityFromRestrictionsPayload(json: {
  gated?: unknown;
  requiresAmazonConnection?: boolean;
}): boolean | null {
  if (json.requiresAmazonConnection === true) return null;
  if (json.gated === true) return false;
  if (json.gated === false) return true;
  return null;
}

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString();
}
function parsePositiveInput(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildCatalogSearchQuery(options: {
  category?: string | null;
  subcategory?: string | null;
  keyword?: string;
  pageSize: number;
  pageToken?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("pageSize", String(options.pageSize));
  if (options.category) params.set("category", options.category);
  if (options.subcategory) params.set("subcategory", options.subcategory);
  if (options.keyword?.trim()) params.set("keyword", options.keyword.trim());
  if (!options.category && !options.subcategory && !options.keyword?.trim()) {
    params.set("q", "best seller");
  }
  if (options.pageToken) params.set("pageToken", options.pageToken);
  return params.toString();
}

export default function ExplorerPage() {
  const { addProduct, getByAsin } = useSavedProducts();
  const {
    selectedCategory,
    selectedSubcategory,
  } = useExplorerCategory();
  const [error, setError] = useState<string | null>(null);
  const [keyword] = useState("");
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
  const [catalogPageSize, setCatalogPageSize] = useState(40);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [ungatedOnly, setUngatedOnly] = useState(false);
  const [eligibilityByAsin, setEligibilityByAsin] = useState<Record<string, boolean | null>>({});
  const [analyzeRequiresAuth, setAnalyzeRequiresAuth] = useState(false);
  const [catalogRequiresAmazonConnect, setCatalogRequiresAmazonConnect] = useState(false);
  const [pendingProductAsin, setPendingProductAsin] = useState<string | null>(null);
  /** Popover on lg+; full-height sheet from the right on smaller screens (mirrors left nav direction). */
  const [sellerModal, setSellerModal] = useState<SellerModalState>(null);
  const [sellerSheetVisible, setSellerSheetVisible] = useState(false);
  const [marketplaceDomain, setMarketplaceDomain] = useState("amazon.com");
  const [loadingPaused, setLoadingPaused] = useState(false);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const eligibilityAbortRef = useRef<AbortController | null>(null);
  // ASINs already submitted for eligibility checking this session.
  const eligibilityQueuedRef = useRef<Set<string>>(new Set());
  // Queue of ASINs waiting to be restriction-checked by the worker.
  const eligibilityPendingRef = useRef<string[]>([]);
  // Incremented on every reset so stale workers know to stop.
  const eligibilityGenRef = useRef(0);
  // True while the queue-draining worker is running.
  const eligibilityWorkerRunningRef = useRef(false);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  /** Caps explorer catalog requests (server also enforces a max page size). */
  const catalogFetchSize = useMemo(() => Math.min(Math.max(catalogPageSize, 10), 60), [catalogPageSize]);

  const openSellerModal = useCallback((e: React.MouseEvent<HTMLButtonElement>, filter: "all" | "FBA" | "FBM") => {
    setSellerModal(buildSellerModalState(e, filter));
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
    setCatalogRequiresAmazonConnect(false);
    setCatalogNextPageToken(null);
    setEligibilityByAsin({});
    eligibilityQueuedRef.current = new Set();
    eligibilityPendingRef.current = [];
    eligibilityGenRef.current += 1;
    eligibilityWorkerRunningRef.current = false;
    setSelectedProduct(null);
    setDetailPanelCost("");
    try {
      const res = await fetch(
        `/api/catalog/search?${buildCatalogSearchQuery({ pageSize: catalogFetchSize })}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (json.code === "AMAZON_CONNECT_REQUIRED") { setCatalogRequiresAmazonConnect(true); return; }
        throw new Error(json.error ?? "Search failed.");
      }
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
  }, [catalogFetchSize]);

  const searchProducts = useCallback(async () => {
    setLoadingPaused(false);
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setCatalogLoading(true);
    setError(null);
    setAnalyzeRequiresAuth(false);
    setCatalogRequiresAmazonConnect(false);
    setCatalogNextPageToken(null);
    setEligibilityByAsin({});
    eligibilityQueuedRef.current = new Set();
    eligibilityPendingRef.current = [];
    eligibilityGenRef.current += 1;
    eligibilityWorkerRunningRef.current = false;
    setSelectedProduct(null);
    setDetailPanelCost("");
    autoLoadMoreCountRef.current = 0;
    try {
      const res = await fetch(
        `/api/catalog/search?${buildCatalogSearchQuery({
          category: selectedCategory,
          subcategory: selectedSubcategory,
          keyword,
          pageSize: catalogFetchSize,
        })}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (json.code === "AMAZON_CONNECT_REQUIRED") { setCatalogRequiresAmazonConnect(true); return; }
        throw new Error(json.error ?? "Search failed.");
      }
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
  }, [selectedCategory, selectedSubcategory, keyword, catalogFetchSize]);

  const loadMoreProducts = useCallback(async () => {
    setLoadingPaused(false);
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const token = catalogNextPageToken;
    if (!token) return;
    setLoadMoreLoading(true);
    setError(null);
    setCatalogRequiresAmazonConnect(false);
    try {
      const res = await fetch(
        `/api/catalog/search?${buildCatalogSearchQuery({
          category: selectedCategory,
          subcategory: selectedSubcategory,
          keyword,
          pageSize: catalogFetchSize,
          pageToken: token,
        })}`,
        { credentials: "include", signal: controller.signal },
      );
      const json = (await res.json()) as {
        items?: CatalogItem[];
        nextPageToken?: string | null;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (json.code === "AMAZON_CONNECT_REQUIRED") { setCatalogRequiresAmazonConnect(true); return; }
        throw new Error(json.error ?? "Search failed.");
      }
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
  }, [selectedCategory, selectedSubcategory, keyword, catalogNextPageToken, catalogFetchSize]);

  const eligibilityByAsinRef = useRef(eligibilityByAsin);
  eligibilityByAsinRef.current = eligibilityByAsin;

  // Persistent queue-draining worker for restriction checks.
  // Runs independently of React's render cycle so catalog updates (new pages
  // loading) never abort in-flight checks. Rate: 5 parallel requests with a
  // 600 ms inter-batch delay → ~4.5 req/s, safely under SP-API's 5 req/s limit.
  const runEligibilityWorker = useCallback(async (gen: number) => {
    if (eligibilityWorkerRunningRef.current) return;
    eligibilityWorkerRunningRef.current = true;
    try {
      while (eligibilityPendingRef.current.length > 0 && gen === eligibilityGenRef.current) {
        const batch = eligibilityPendingRef.current.splice(0, 5);
        const results = await Promise.all(
          batch.map(async (asin) => {
            try {
              const res = await fetch(`/api/catalog/restrictions?asin=${encodeURIComponent(asin)}`, {
                credentials: "same-origin",
              });
              if (!res.ok) return { asin, eligible: null as boolean | null };
              const json = (await res.json()) as {
                gated?: boolean | null;
                asin?: string;
                requiresAmazonConnection?: boolean;
              };
              return { asin: json.asin ?? asin, eligible: eligibilityFromRestrictionsPayload(json) };
            } catch {
              return { asin, eligible: null as boolean | null };
            }
          }),
        );
        if (gen !== eligibilityGenRef.current) break;
        const update: Record<string, boolean | null> = {};
        results.forEach((r) => { update[r.asin] = r.eligible; });
        setEligibilityByAsin((prev) => ({ ...prev, ...update }));
        if (eligibilityPendingRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    } finally {
      eligibilityWorkerRunningRef.current = false;
      // If new items arrived while we were finishing, restart.
      if (eligibilityPendingRef.current.length > 0 && gen === eligibilityGenRef.current) {
        void runEligibilityWorker(gen);
      }
    }
  }, []);

  // When "Ungated only" is on, enqueue any new catalog items and kick the worker.
  // No cleanup abort here — the worker drains the queue independently and is only
  // stopped by incrementing eligibilityGenRef (done on reset / category change).
  useEffect(() => {
    if (!ungatedOnly || catalogResults.length === 0 || loadingPaused) return;
    const newAsins = catalogResults
      .map((i) => i.asin)
      .filter((asin) => !eligibilityQueuedRef.current.has(asin));
    if (newAsins.length === 0) return;
    newAsins.forEach((asin) => eligibilityQueuedRef.current.add(asin));
    eligibilityPendingRef.current.push(...newAsins);
    void runEligibilityWorker(eligibilityGenRef.current);
  }, [ungatedOnly, catalogResults, loadingPaused, runEligibilityWorker]);

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

  /** When "Ungated only" is on AND a category (or subcategory) is selected, auto-load catalog up to a modest cap.
   * Wait until current eligibility checks finish before loading more so restriction
   * checks aren't aborted by new catalog items arriving mid-batch. */
  const CATEGORY_SCAN_CAP = 360;
  const eligibilityStillChecking = useMemo(() => {
    if (!ungatedOnly || catalogResults.length === 0) return false;
    const asins = catalogResults.map((p) => p.asin);
    return asins.some((asin) => eligibilityByAsin[asin] === undefined);
  }, [ungatedOnly, catalogResults, eligibilityByAsin]);

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
    // Restriction checks now run via a persistent queue worker that is never
    // aborted by catalog updates, so we can load the next page immediately
    // without waiting for checks to finish.
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

  /** When "BSR low first" and a subcategory is selected, auto-load up to 3 more pages.
   * Skips when ungatedOnly is on — the category ungated auto-load handles that path and
   * the two effects would race, causing in-flight restriction checks to be aborted. */
  useEffect(() => {
    if (
      ungatedOnly ||
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
    ungatedOnly,
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
  const [subscriptionPaid, setSubscriptionPaid] = useState<boolean | undefined>(undefined);
  const prevAmazonHeaderConnectedRef = useRef<boolean | null>(null);

  const productTableContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (selectedSubcategory) {
      searchProductsRef.current();
    }
  }, [selectedSubcategory]);

  const hasAutoLoadedRef = useRef(false);
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (hasAutoLoadedRef.current) return;
    if (selectedCategory || selectedSubcategory) return;
    hasAutoLoadedRef.current = true;
    void loadInitialBestSellers();
  }, [sessionStatus, selectedCategory, selectedSubcategory, loadInitialBestSellers]);

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
        setCatalogResults((prev) =>
          prev.map((p) =>
            p.asin === result.asin && result.salesRank != null ? { ...p, rank: result.salesRank } : p,
          ),
        );
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

  const showProductTable = true;

  const explorerLoading = catalogLoading || loadMoreLoading || (!loadingPaused && eligibilityStillChecking);
  const cancelExplorerLoading = useCallback(() => {
    setLoadingPaused(true);
    catalogAbortRef.current?.abort();
    eligibilityAbortRef.current?.abort();
    // Stop the queue-based worker by bumping the generation counter.
    eligibilityGenRef.current += 1;
    eligibilityPendingRef.current = [];
    eligibilityWorkerRunningRef.current = false;
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
    if (!session?.user) return;
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (overview: {
          subscriptionStatus?: string;
          appOwnerAccess?: boolean;
          billingDisabled?: boolean;
          testingBillingPass?: boolean;
          promoDaysLeft?: number;
        } | null) => {
          if (!overview) return;
          const paid =
            overview.appOwnerAccess ||
            overview.billingDisabled ||
            overview.testingBillingPass ||
            overview.subscriptionStatus === "active" ||
            overview.subscriptionStatus === "trialing" ||
            (typeof overview.promoDaysLeft === "number" && overview.promoDaysLeft > 0);
          setSubscriptionPaid(Boolean(paid));
        },
      )
      .catch(() => {});
  }, [session?.user]);

  useEffect(() => {
    const prev = prevAmazonHeaderConnectedRef.current;
    prevAmazonHeaderConnectedRef.current = amazonHeaderConnected;
    if (prev === true && !amazonHeaderConnected) {
      eligibilityAbortRef.current?.abort();
      eligibilityAbortRef.current = null;
      setEligibilityByAsin({});
      eligibilityQueuedRef.current = new Set();
      eligibilityPendingRef.current = [];
      eligibilityGenRef.current += 1;
      eligibilityWorkerRunningRef.current = false;
      setUngatedOnly(false);
    }
  }, [amazonHeaderConnected]);

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
          onClose={() => {
            const wasGated = catalogRequiresAmazonConnect;
            setShowAmazonAccountModal(false);
            refreshAmazonHeaderStatus();
            if (wasGated) {
              setCatalogRequiresAmazonConnect(false);
              setError(null);
              void loadInitialBestSellers();
            }
          }}
          isPaidPlan={subscriptionPaid}
        />
      )}
      <Suspense fallback={null}>
        <AmazonOAuthQueryCleanup />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3 pb-3 sm:gap-3 sm:p-4 sm:pb-4">
        <header className="hf-dash-brand-header invert-exempt hidden shrink-0 rounded-xl border border-slate-600/80 border-t-4 border-t-teal-500 px-3 py-1.5 md:block sm:px-3 sm:py-2 lg:px-4 lg:py-2">
          <div className="flex flex-col gap-1 md:gap-1">
            <div className="flex min-w-0 flex-nowrap items-center gap-0 -space-x-1.5 md:-space-x-2.5">
              <DashboardHeaderMark variant="toolbar" />
              <h1 className="min-w-0 whitespace-nowrap text-base font-bold leading-none tracking-tight sm:text-lg md:text-xl lg:text-2xl">
                <span className="text-slate-100 drop-shadow-[0_1px_14px_rgb(0_0_0/_0.5)]">{appHeaderCompact}</span>
                <span className="font-semibold text-slate-400"> {appHeaderSuffix}</span>
              </h1>
            </div>
            <div className="flex shrink-0 justify-end">
              <DashboardHeaderAccount
                session={session}
                amazonConnected={amazonHeaderConnected}
                accountTitle={amazonHeaderTitle}
                onConnectAmazon={() => setShowAmazonAccountModal(true)}
                onAmazonDisconnected={refreshAmazonHeaderStatus}
              />
            </div>
          </div>
        </header>

        {/* Filters: Keyword, Sort, BSR max, Ungated */}
        <section className="shrink-0 rounded-xl border border-slate-600/80 bg-slate-800/90 px-3 py-2 shadow-lg shadow-black/10 sm:px-3.5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={amazonHeaderConnected ? ungatedOnly : false}
                aria-label={
                  !session?.user
                    ? "Sign in to filter by ungated products"
                    : !amazonHeaderConnected
                      ? "Connect Amazon seller account"
                      : ungatedOnly
                        ? "Ungated filter is on. Click to show all products."
                        : "Amazon is linked. Click to turn on ungated filter."
                }
                title={
                  !session?.user
                    ? "Sign in to filter by what your seller account can list."
                    : !amazonHeaderConnected
                      ? "Connect Amazon to check listing eligibility for your account."
                      : ungatedOnly
                        ? "Showing only ASINs confirmed eligible. Click to show all."
                        : "Show only ASINs your linked account can list without approval."
                }
                disabled={sessionStatus === "loading"}
                onClick={() => {
                  if (sessionStatus === "loading") return;
                  if (!session?.user) {
                    router.push(`/login?callbackUrl=${encodeURIComponent("/")}`);
                    return;
                  }
                  if (!amazonHeaderConnected) {
                    setShowAmazonAccountModal(true);
                    return;
                  }
                  setLoadingPaused(false);
                  setUngatedOnly((v) => !v);
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-teal-400/55 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-wait disabled:opacity-55 ${
                  ungatedOnly && amazonHeaderConnected
                    ? "border-transparent bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/30 hover:from-teal-400 hover:to-cyan-500"
                    : "border-teal-500/45 bg-teal-950/30 text-teal-100 hover:border-teal-400/60 hover:bg-teal-900/35 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  Ungated only (your account)
                  {ungatedOnly && amazonHeaderConnected ? (
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      On
                    </span>
                  ) : null}
                </span>
              </button>
              {ungatedOnly && amazonHeaderConnected ? (
                <span className="flex flex-wrap items-center gap-2 text-xs text-teal-100/95">
                  <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-emerald-200">
                    Active
                  </span>
                  <span className="text-teal-200/85">Only ASINs you can list without approval.</span>
                </span>
              ) : !session?.user && sessionStatus !== "loading" ? (
                <span className="text-xs text-teal-200/75">Click to sign in</span>
              ) : null}
            </div>
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
          </div>
        </section>

        {catalogRequiresAmazonConnect ? (
          <div className="shrink-0 rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
            Connect your Amazon seller account to browse the catalog — use the <span className="font-medium text-teal-400">Connect Amazon</span> button above.
          </div>
        ) : error ? (
          <div className="shrink-0 rounded-lg border border-rose-800 bg-rose-900/30 px-3 py-2 text-sm text-rose-300">
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
          <div className="shrink-0 rounded-lg border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">
            {infoMessage}
          </div>
        ) : null}

        {/* Product table - Product, Brand, BSR only; fit middle without horizontal scroll */}
        {showProductTable && (
          <section
            ref={productTableContainerRef}
            className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-xl border border-slate-600/80 bg-slate-800/90 shadow-lg shadow-black/10"
          >
            <div className="flex shrink-0 flex-col gap-0 border-b border-slate-600/80 bg-slate-800/50 px-2.5 py-1 md:px-3 md:py-1.5">
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
                    {ungatedOnly && catalogResults.length > filteredAndSortedProducts.length
                      ? ` · ${catalogResults.length} scanned`
                      : ""}
                    {catalogNextPageToken ? " · more available" : ""}
                  </p>
                  {catalogNextPageToken && !loadMoreLoading && !catalogLoading ? (
                    <button
                      type="button"
                      onClick={() => loadMoreProducts()}
                      className="shrink-0 rounded border border-sky-600 px-1.5 text-[10px] leading-4 text-sky-400 hover:bg-sky-600/20"
                    >
                      Load more
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-y-contain bg-slate-800/90 pb-14 pt-0 md:pb-10">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="sticky top-0 z-[1] border-b border-slate-600/80 bg-slate-700 text-[10px] uppercase tracking-wide text-slate-400 shadow-[0_1px_0_0_rgb(71_85_105_/_0.8)] md:text-xs">
                  <tr>
                    <th className="w-[60%] bg-slate-700 px-2 py-1 md:py-1.5">Product</th>
                    <th className="w-[20%] bg-slate-700 px-2 py-1 md:py-1.5">Brand</th>
                    <th className="w-[20%] bg-slate-700 px-2 py-1 md:py-1.5">BSR</th>
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
                              <>Checking eligibility against your seller account…</>
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
                                    <Link href="/login" className="text-teal-400 hover:text-teal-300 underline">
                                      Sign in
                                    </Link>{" "}
                                    and connect Amazon to filter by ungated ASINs, or uncheck &quot;Ungated only&quot;.
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
                        <td className="min-w-0 px-2 py-0.5 md:py-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-6 w-6 shrink-0 rounded border border-slate-600 object-contain md:h-7 md:w-7"
                              />
                            ) : (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-600 bg-slate-700 text-[8px] text-slate-500 md:h-7 md:w-7">
                                —
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium leading-tight text-slate-200" title={item.title}>
                                {item.title || item.asin}
                              </p>
                              <p className="truncate text-[9px] leading-tight text-slate-500">{item.asin}</p>
                            </div>
                          </div>
                        </td>
                        <td className="truncate px-2 py-0.5 text-[11px] text-slate-300 md:py-1" title={item.brand ?? undefined}>
                          {item.brand || "—"}
                        </td>
                        <td className="px-2 py-0.5 text-[11px] tabular-nums text-slate-300 md:py-1">{formatNumber(item.rank)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {catalogNextPageToken && !catalogLoading ? (
                <div className="flex justify-center border-t border-slate-700 bg-slate-800/95 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => loadMoreProducts()}
                    disabled={loadMoreLoading}
                    className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {loadMoreLoading ? "Loading…" : `Load next ${catalogFetchSize}`}
                  </button>
                </div>
              ) : null}
            </div>
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
        className={`product-details-panel fixed flex min-h-0 flex-col overflow-hidden border-l border-slate-700 bg-slate-800 shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] max-lg:inset-x-0 max-lg:top-0 max-lg:z-[100] max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:w-full max-lg:max-w-none ${
          mobileDetailsOpen ? "max-lg:translate-x-0" : "max-lg:pointer-events-none max-lg:translate-x-full"
        } lg:static lg:z-auto lg:h-full lg:max-h-full lg:w-80 lg:shrink-0 lg:translate-x-0 xl:w-96`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3 max-lg:pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Product Details</h3>
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
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] [-webkit-overflow-scrolling:touch]">
            <div className="px-3 pb-1 pt-2 text-[13px] leading-snug text-slate-200 lg:px-3.5 lg:pb-2 lg:pt-2.5">
          {panelAnalysisLoading ? (
            <div className="flex flex-col gap-3">
              <div className="hf-analyzing-caption pl-0.5">Analyzing product…</div>
              <div className="skeleton-shimmer h-32 w-full rounded-lg" />
              <div className="space-y-2 px-0.5">
                <div className="skeleton-shimmer h-3.5 w-3/4 rounded" />
                <div className="skeleton-shimmer h-3 w-1/2 rounded opacity-75" />
                <div className="skeleton-shimmer h-3 w-2/3 rounded opacity-50" />
              </div>
              <div className="skeleton-shimmer h-6 w-20 rounded-full" />
              <div className="skeleton-shimmer h-12 w-full rounded-lg" />
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2.5">
                    <div className="skeleton-shimmer mb-1.5 h-2.5 w-1/2 rounded" />
                    <div className="skeleton-shimmer h-4 w-2/3 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : !selectedProduct ? (
            <div className="flex flex-col gap-4 text-sm">
              <div className="hf-detail-empty-card flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-9 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/60">
                  <svg className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="18" y="3" width="4" height="18" rx="1" />
                    <rect x="10" y="8" width="4" height="13" rx="1" />
                    <rect x="2" y="13" width="4" height="8" rx="1" />
                    <path d="M2 21h20" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Select a product to begin analysis</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Choose a product from the catalog to view sourcing insights, eligibility, and profit estimates.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["BSR", "Buy Box", "FBA / FBM", "Cost", "Profit", "ROI"].map((label) => (
                  <div key={label} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 transition-colors hover:bg-slate-800/60">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <div className="skeleton-shimmer h-4 w-10 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ProductIntelPanelContent
              product={selectedProduct}
              marketplaceDomain={marketplaceDomain}
              sellerType={sellerType}
              onSellerTypeChange={setSellerType}
              detailPanelCost={detailPanelCost}
              onDetailPanelCostChange={setDetailPanelCost}
              shippingCost={shippingCost}
              onShippingCostChange={setShippingCost}
              projectedMonthlyUnits={projectedMonthlyUnits}
              onProjectedMonthlyUnitsChange={setProjectedMonthlyUnits}
              openSellerModal={openSellerModal}
              variationDetail="explorer"
              amazonConnected={amazonHeaderConnected}
            />
          )}
            </div>
          </div>
          {selectedProduct ? (
            <SellerListDialog
              sellerModal={sellerModal}
              sellerSheetVisible={sellerSheetVisible}
              selectedProduct={selectedProduct}
              marketplaceDomain={marketplaceDomain}
              onClose={() => setSellerModal(null)}
            />
          ) : null}
        </div>
      </aside>
      </div>
    </div>
  );
}
