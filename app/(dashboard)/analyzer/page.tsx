"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  Suspense,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardHeaderAccount } from "@/app/components/DashboardHeaderAccount";
import { ProductInsightBlurb } from "@/app/components/ProductInsightBlurb";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";
import { useSavedProducts } from "@/app/context/SavedProductsContext";
import { amazonOfferListingUrl, amazonSellerStorefrontUrl } from "@/lib/marketplaces";
import type { ProductAnalysis, SellerType } from "@/lib/types";

type SortColumn =
  | "inputIdentifier"
  | "imageUrl"
  | "asin"
  | "brand"
  | "offerLabel"
  | "sellerType"
  | "buyBoxPrice"
  | "wholesalePrice"
  | "shippingCost"
  | "totalFees"
  | "netProfit"
  | "roiPercent"
  | "salesRank"
  | "estimatedMonthlySales"
  | "amazonSalesVolumeLabel"
  | "decision";

type SortDirection = "asc" | "desc";
type ViewFilter = "all" | "buy_now" | "ungated" | "ungate_profitable" | "restricted" | "needs_review";

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

type ZxingScanResultLike = {
  getText: () => string;
};

type ZxingScanErrorLike = {
  name?: string;
};

type ZxingReaderLike = {
  decodeFromVideoDevice: (
    deviceId: string | null,
    videoSource: string | HTMLVideoElement | null,
    callbackFn: (result: ZxingScanResultLike | undefined, error?: ZxingScanErrorLike) => void,
  ) => Promise<void>;
  decodeFromImageElement: (image: HTMLImageElement) => Promise<ZxingScanResultLike>;
  stopContinuousDecode?: () => void;
  stopAsyncDecode?: () => void;
  reset: () => void;
};

const numberColumns = new Set<SortColumn>([
  "buyBoxPrice",
  "wholesalePrice",
  "shippingCost",
  "totalFees",
  "netProfit",
  "roiPercent",
  "salesRank",
  "estimatedMonthlySales",
]);

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString();
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Extract ASIN from Amazon product URL or return input if already ASIN-like. */
function normalizeLookupInput(input: string): string {
  const trimmed = input.trim();
  const dpMatch = trimmed.match(/\/dp\/([A-Z0-9]{10})/i);
  if (dpMatch) return dpMatch[1];
  const gpMatch = trimmed.match(/\/gp\/product\/([A-Z0-9]{10})/i);
  if (gpMatch) return gpMatch[1];
  return trimmed;
}

function evaluateCalculatorExpression(rawValue: string): number | null {
  const source = rawValue.replace(/\s+/g, "");
  if (!source) {
    return null;
  }
  if (!/^[0-9+\-*/().]+$/.test(source)) {
    return null;
  }

  let cursor = 0;

  function parseExpression(): number | null {
    let value = parseTerm();
    if (value === null) {
      return null;
    }
    while (cursor < source.length && (source[cursor] === "+" || source[cursor] === "-")) {
      const operator = source[cursor];
      cursor += 1;
      const right = parseTerm();
      if (right === null) {
        return null;
      }
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number | null {
    let value = parseFactor();
    if (value === null) {
      return null;
    }
    while (cursor < source.length && (source[cursor] === "*" || source[cursor] === "/")) {
      const operator = source[cursor];
      cursor += 1;
      const right = parseFactor();
      if (right === null) {
        return null;
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseFactor(): number | null {
    if (cursor >= source.length) {
      return null;
    }

    const current = source[cursor];
    if (current === "+") {
      cursor += 1;
      return parseFactor();
    }
    if (current === "-") {
      cursor += 1;
      const inner = parseFactor();
      return inner === null ? null : -inner;
    }
    if (current === "(") {
      cursor += 1;
      const inner = parseExpression();
      if (inner === null || source[cursor] !== ")") {
        return null;
      }
      cursor += 1;
      return inner;
    }

    return parseNumber();
  }

  function parseNumber(): number | null {
    const start = cursor;
    let dotCount = 0;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char >= "0" && char <= "9") {
        cursor += 1;
        continue;
      }
      if (char === ".") {
        dotCount += 1;
        if (dotCount > 1) {
          return null;
        }
        cursor += 1;
        continue;
      }
      break;
    }

    if (start === cursor) {
      return null;
    }

    const parsed = Number(source.slice(start, cursor));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const result = parseExpression();
  if (result === null || cursor !== source.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}

function parseNonNegativeInput(rawValue: string): number | null {
  const parsed = evaluateCalculatorExpression(rawValue);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function parsePositiveInput(rawValue: string): number | null {
  const parsed = evaluateCalculatorExpression(rawValue);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function rowColorClasses(color: ProductAnalysis["rowColor"]): string {
  if (color === "green") {
    return "bg-emerald-900/30";
  }
  if (color === "yellow") {
    return "bg-amber-900/30";
  }
  return "bg-rose-900/30";
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
  if (decision === "BUY") {
    return "bg-emerald-900/60 text-emerald-200";
  }
  if (decision === "WORTH UNGATING") {
    return "bg-amber-900/60 text-amber-200";
  }
  if (decision === "LOW_MARGIN") {
    return "bg-orange-900/50 text-orange-200";
  }
  if (decision === "NO_MARGIN" || decision === "BAD") {
    return "bg-rose-900/50 text-rose-200";
  }
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
    const badReason = item.reasons.find(
      (r) => /sales rank|above 100|IP|complaint risk/i.test(r),
    );
    return badReason ?? (item.reasons[0] ?? null);
  }
  if (item.decision === "NO_MARGIN") {
    return item.netProfit != null && item.netProfit <= 0
      ? "No profit at your cost and current buy box."
      : item.reasons[0] ?? null;
  }
  if (item.decision === "LOW_MARGIN") {
    return item.roiPercent != null && item.roiPercent < 10
      ? "ROI below 10%."
      : item.reasons[0] ?? null;
  }
  if (item.decision === "WORTH UNGATING") {
    return "Gated but projected profit justifies ungating cost.";
  }
  if (item.decision === "BUY") {
    return "Profit and ROI look good at current data.";
  }
  return item.reasons[0] ?? null;
}

function compareValues(
  a: ProductAnalysis,
  b: ProductAnalysis,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): number {
  const directionFactor = sortDirection === "asc" ? 1 : -1;

  if (numberColumns.has(sortColumn)) {
    const left = (a[sortColumn] as number | null) ?? Number.NEGATIVE_INFINITY;
    const right = (b[sortColumn] as number | null) ?? Number.NEGATIVE_INFINITY;
    return (left - right) * directionFactor;
  }

  const left = String(a[sortColumn] ?? "").toLowerCase();
  const right = String(b[sortColumn] ?? "").toLowerCase();
  if (left < right) {
    return -1 * directionFactor;
  }
  if (left > right) {
    return 1 * directionFactor;
  }
  return 0;
}

function matchesViewFilter(item: ProductAnalysis, viewFilter: ViewFilter): boolean {
  if (viewFilter === "buy_now") {
    return item.decision === "BUY" && (item.netProfit ?? 0) > 0;
  }

  if (viewFilter === "ungated") {
    return item.approvalRequired === false && item.listingRestricted === false && !item.restrictedBrand;
  }

  if (viewFilter === "ungate_profitable") {
    return item.decision === "WORTH UNGATING" || (item.worthUngating && (item.netProfit ?? 0) > 0);
  }

  if (viewFilter === "restricted") {
    return item.listingRestricted === true || item.approvalRequired === true || item.restrictedBrand;
  }

  if (viewFilter === "needs_review") {
    return (
      item.decision === "UNKNOWN" ||
      Boolean(item.error) ||
      item.asin === null ||
      item.buyBoxPrice === null ||
      item.netProfit === null ||
      item.roiPercent === null
    );
  }

  return true;
}

export default function AnalyzerPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-slate-400">Loading…</div>}>
      <AnalyzerPageContent />
    </Suspense>
  );
}

function AnalyzerPageContent() {
  const { addProduct, addProducts, getByAsin } = useSavedProducts();
  const { data: session } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [keyword, setKeyword] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("0");
  const [brand, setBrand] = useState("");
  const [sellerType, setSellerType] = useState<SellerType>("FBA");
  const [shippingCost, setShippingCost] = useState("0");
  const [projectedMonthlyUnits, setProjectedMonthlyUnits] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [isUploadLoading, setIsUploadLoading] = useState(false);
  const [results, setResults] = useState<ProductAnalysis[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("salesRank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [lastRunMode, setLastRunMode] = useState<"manual" | "upload" | null>(null);
  const [isKeywordMode, setIsKeywordMode] = useState(false);
  const [lastKeyword, setLastKeyword] = useState<string | null>(null);
  const [keywordPageSize, setKeywordPageSize] = useState(20);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerRunNonce, setScannerRunNonce] = useState(0);
  const [manualIdentifierResolved, setManualIdentifierResolved] = useState(false);
  const [marketplaceDomain, setMarketplaceDomain] = useState("amazon.com");
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysis | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [popupQuantity, setPopupQuantity] = useState("");
  /** Popover on lg+; full-height sheet from the right on smaller screens (mirrors left nav direction). */
  const [sellerModal, setSellerModal] = useState<
    | null
    | { filter: "all" | "FBA" | "FBM"; layout: "sheet" }
    | { filter: "all" | "FBA" | "FBM"; layout: "popover"; top: number; left: number; width: number }
  >(null);
  const [sellerSheetVisible, setSellerSheetVisible] = useState(false);
  const [panelAnalysisLoading, setPanelAnalysisLoading] = useState(false);
  const [detailPanelCost, setDetailPanelCost] = useState("");
  const [resultsPage, setResultsPage] = useState(1);
  const [copiedAsin, setCopiedAsin] = useState<string | null>(null);
  const [showAmazonAccountModal, setShowAmazonAccountModal] = useState(false);
  const [amazonHeaderConnected, setAmazonHeaderConnected] = useState(false);
  const [amazonHeaderTitle, setAmazonHeaderTitle] = useState<string | null>(null);
  const [bulkUploadEnabled, setBulkUploadEnabled] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<ZxingReaderLike | null>(null);
  const hasScannedRef = useRef(false);
  const lastAutoManualCalcKeyRef = useRef("");

  const openSellerModal = useCallback((e: MouseEvent<HTMLButtonElement>, filter: "all" | "FBA" | "FBM") => {
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
  }, [selectedProduct?.id]);

  /** Load user preferences (analysis defaults) once on mount. */
  useEffect(() => {
    fetch("/api/settings/preferences", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data: { default_seller_type?: "FBA" | "FBM"; default_shipping_cost_fbm?: number }) => {
        if (data.default_seller_type === "FBM") setSellerType("FBM");
        if (typeof data.default_shipping_cost_fbm === "number" && data.default_shipping_cost_fbm >= 0)
          setShippingCost(String(data.default_shipping_cost_fbm));
      })
      .catch(() => {});
  }, []);

  // Reset cost input whenever a different product is selected (catalog-click workflow).
  useEffect(() => {
    setDetailPanelCost("");
  }, [selectedProduct?.id]);

  useEffect(() => {
    setResultsPage(1);
  }, [results.length, viewFilter]);

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
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((overview) => {
        const proLike =
          Boolean(overview?.appOwnerAccess) ||
          Number(overview?.promoDaysLeft ?? 0) > 0 ||
          ((overview?.subscriptionStatus === "active" || overview?.subscriptionStatus === "trialing") &&
            overview?.subscriptionPlan === "pro");
        setBulkUploadEnabled(proLike);
      })
      .catch(() => {
        setBulkUploadEnabled(false);
      });
  }, []);

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

  const searchParams = useSearchParams();
  useEffect(() => {
    const asin = searchParams.get("asin");
    if (asin) {
      setIdentifier(asin);
      const cached = getByAsin(asin);
      if (cached) {
        setSelectedProduct(cached);
        setMobileDetailsOpen(true);
        setDetailPanelCost("");
        setInfoMessage("Loaded from saved products (no API call).");
      }
    }
  }, [searchParams, getByAsin]);

  const stopScanner = useCallback(() => {
    if (zxingReaderRef.current) {
      zxingReaderRef.current.stopContinuousDecode?.();
      zxingReaderRef.current.stopAsyncDecode?.();
      zxingReaderRef.current.reset();
      zxingReaderRef.current = null;
    }

    if (scannerFrameRef.current !== null) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    hasScannedRef.current = false;
  }, []);

  const runManualAnalysis = useCallback(
    async (
      selectedSellerType: SellerType,
      isAutoRerun = false,
      identifierOverride?: string,
      isScannerTriggered = false,
      lookupOnly = false,
    ): Promise<void> => {
      const effectiveIdentifier = normalizeLookupInput(identifierOverride ?? identifier);
      if (!effectiveIdentifier) {
        setErrorMessage("Enter ASIN/UPC/EAN before running manual analysis.");
        return;
      }

      const parsedWholesalePrice = parseNonNegativeInput(wholesalePrice);
      const parsedProjectedUnits = parsePositiveInput(projectedMonthlyUnits);
      if (!lookupOnly && parsedWholesalePrice === null) {
        setErrorMessage("Enter a valid unit price.");
        return;
      }
      if (!lookupOnly && parsedProjectedUnits === null) {
        setErrorMessage("Enter a valid unit quantity. Calculator format is supported (example: 1/2).");
        return;
      }

      setErrorMessage(null);
      setInfoMessage(null);
      setIsManualLoading(true);

      const requestBody = {
        identifier: effectiveIdentifier,
        wholesalePrice: lookupOnly ? 0 : parsedWholesalePrice ?? 0,
        brand,
        projectedMonthlyUnits: lookupOnly ? 1 : parsedProjectedUnits ?? 1,
        sellerType: selectedSellerType,
        shippingCost: selectedSellerType === "FBM" ? Number(shippingCost) : 0,
      };

      try {
        const variationsResponse = await fetch("/api/analyze/variations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier: effectiveIdentifier }),
        });
        const variationsJson = (await variationsResponse.json()) as {
          ok?: boolean;
          error?: string;
          results?: ProductAnalysis[];
        };

        let analysisResults: ProductAnalysis[];
        if (variationsResponse.ok && variationsJson.results && variationsJson.results.length > 0) {
          analysisResults = variationsJson.results;
        } else {
          const offersResponse = await fetch("/api/analyze/offers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
          });
          const offersJson = (await offersResponse.json()) as {
            ok?: boolean;
            error?: string;
            results?: ProductAnalysis[];
          };

          if (offersResponse.ok && offersJson.results && offersJson.results.length > 0) {
            analysisResults = offersJson.results;
          } else {
            const singleResponse = await fetch("/api/analyze", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(requestBody),
            });
            const singleJson = (await singleResponse.json()) as { error?: string; result?: ProductAnalysis };
            if (!singleResponse.ok || !singleJson.result) {
              throw new Error(singleJson.error ?? "Manual analysis failed.");
            }
            analysisResults = [singleJson.result as ProductAnalysis];
          }
        }

        const analysisResult = analysisResults[0];
        const detectedBrand = analysisResult.brand?.trim() ?? "";
        if (detectedBrand) {
          setBrand(detectedBrand);
        }

        if (lookupOnly) {
          if (analysisResult.error || !analysisResult.asin) {
            setManualIdentifierResolved(false);
            setResults(analysisResults);
            setErrorMessage(analysisResult.error ?? "Unable to load product data from Amazon for this identifier.");
            setInfoMessage(null);
            return;
          }

          setManualIdentifierResolved(true);
          setResults(analysisResults);
          addProduct(analysisResult);
          setSelectedProduct(analysisResult);
          setMobileDetailsOpen(true);
          setDetailPanelCost("");
          setLastRunMode("manual");
          setInfoMessage(
            isScannerTriggered
              ? `Scanned ${effectiveIdentifier}. Product found. Add cost and units in the panel.`
              : analysisResults.length > 1
                ? `${analysisResults.length} listings found. Click a row for details.`
                : "Product found. Add cost and units in the panel.",
          );
          return;
        }

        setManualIdentifierResolved(true);
        setSelectedProduct(analysisResult);
        setMobileDetailsOpen(true);
        addProduct(analysisResult);

        if (isAutoRerun) {
          setResults(analysisResults);
          setInfoMessage(`Manual lookup re-analyzed for ${selectedSellerType}.`);
        } else {
          setResults(analysisResults);
          setInfoMessage(
            analysisResults.length > 1
              ? `${analysisResults.length} listings. Click a row for details in the right panel.`
              : isScannerTriggered
                ? "Scanned and analyzed successfully."
                : "Manual lookup complete.",
          );
        }
        if (analysisResult.error) {
          setErrorMessage(analysisResult.error);
        }
        setLastRunMode("manual");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Manual lookup failed.");
      } finally {
        setIsManualLoading(false);
      }
    },
    [identifier, wholesalePrice, brand, projectedMonthlyUnits, shippingCost],
  );

  useEffect(() => {
    if (!isScannerOpen || !videoRef.current) {
      stopScanner();
      return;
    }

    setScannerError(null);
    hasScannedRef.current = false;
    let cancelled = false;
    let detectionErrorShown = false;
    const applyScannedValue = (scannedValue: string): void => {
      if (!scannedValue || cancelled || hasScannedRef.current) {
        return;
      }
      hasScannedRef.current = true;
      setIdentifier(scannedValue);
      setManualIdentifierResolved(false);
      setBrand("");
      setResults([]);
      setLastRunMode(null);
      lastAutoManualCalcKeyRef.current = "";
      setErrorMessage(null);
      setIsScannerOpen(false);

      if (isManualLoading || isUploadLoading) {
        setInfoMessage(`Scanned identifier: ${scannedValue}. Finish current run, then continue.`);
        return;
      }

      setInfoMessage(`Scanned identifier: ${scannedValue}. Loading product data...`);
      void runManualAnalysis(sellerType, false, scannedValue, true, true);
    };

    const scanLoop = async (detector: BarcodeDetectorInstance): Promise<void> => {
      if (cancelled || hasScannedRef.current || !videoRef.current) {
        return;
      }

      try {
        if (videoRef.current.readyState >= 2) {
          const detections = await detector.detect(videoRef.current);
          const scannedValue = detections
            .map((entry) => entry.rawValue?.trim() ?? "")
            .find((value) => value.length > 0);

          if (scannedValue) {
            applyScannedValue(scannedValue);
            return;
          }
        }
      } catch {
        if (!detectionErrorShown) {
          setScannerError("Scanner is active but could not decode this frame. Try better lighting and distance.");
          detectionErrorShown = true;
        }
      }

      scannerFrameRef.current = window.requestAnimationFrame(() => {
        void scanLoop(detector);
      });
    };

    const startScanner = async (): Promise<void> => {
      try {
        if (!window.isSecureContext) {
          setScannerError(
            "Camera is blocked on insecure pages. Open this app on https:// or on http://localhost, then allow camera permission.",
          );
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setScannerError("Camera access is not available in this browser.");
          return;
        }

        const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

        if (!videoRef.current) {
          return;
        }

        if (!detectorCtor) {
          const zxingModule = await import("@zxing/library");
          if (cancelled || !videoRef.current) {
            return;
          }

          const zxingReader = new zxingModule.BrowserMultiFormatReader() as unknown as ZxingReaderLike;
          zxingReaderRef.current = zxingReader;
          await zxingReader.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
            if (cancelled || hasScannedRef.current) {
              return;
            }

            const scannedValue = result?.getText().trim();
            if (scannedValue) {
              applyScannedValue(scannedValue);
              return;
            }

            const errorName = error?.name ?? "";
            if (
              errorName &&
              errorName !== "NotFoundException" &&
              errorName !== "ChecksumException" &&
              errorName !== "FormatException" &&
              !detectionErrorShown
            ) {
              setScannerError("Scanner is active but could not decode this frame. Try better lighting and distance.");
              detectionErrorShown = true;
            }
          });
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;
        if (!videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new detectorCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
        });

        scannerFrameRef.current = window.requestAnimationFrame(() => {
          void scanLoop(detector);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setScannerError(error instanceof Error ? error.message : "Unable to access camera.");
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isScannerOpen, scannerRunNonce, stopScanner, isManualLoading, isUploadLoading, sellerType, runManualAnalysis]);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: { marketplaceDomain?: string }) => {
        if (data.marketplaceDomain) setMarketplaceDomain(data.marketplaceDomain);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!manualIdentifierResolved) {
      lastAutoManualCalcKeyRef.current = "";
      return;
    }

    if (isManualLoading || isUploadLoading || isScannerOpen || !identifier.trim()) {
      return;
    }

    const parsedWholesalePrice = parseNonNegativeInput(wholesalePrice);
    const parsedProjectedUnits = parsePositiveInput(projectedMonthlyUnits);
    if (parsedWholesalePrice === null || parsedProjectedUnits === null) {
      return;
    }

    const autoCalcKey = [
      identifier.trim().toUpperCase(),
      sellerType,
      shippingCost,
      parsedWholesalePrice.toString(),
      parsedProjectedUnits.toString(),
    ].join("|");
    if (lastAutoManualCalcKeyRef.current === autoCalcKey) {
      return;
    }

    const rerunTimer = window.setTimeout(() => {
      lastAutoManualCalcKeyRef.current = autoCalcKey;
      void runManualAnalysis(sellerType, true);
    }, 800);

    return () => {
      window.clearTimeout(rerunTimer);
    };
  }, [
    wholesalePrice,
    projectedMonthlyUnits,
    manualIdentifierResolved,
    isManualLoading,
    isUploadLoading,
    isScannerOpen,
    identifier,
    sellerType,
    shippingCost,
    runManualAnalysis,
  ]);

  const filteredSortedResults = useMemo(() => {
    return [...results]
      .filter((item) => matchesViewFilter(item, viewFilter))
      .sort((left, right) => compareValues(left, right, sortColumn, sortDirection));
  }, [results, viewFilter, sortColumn, sortDirection]);

  const RESULTS_PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(filteredSortedResults.length / RESULTS_PAGE_SIZE));
  const displayedResults = useMemo(() => {
    const start = (resultsPage - 1) * RESULTS_PAGE_SIZE;
    return filteredSortedResults.slice(start, start + RESULTS_PAGE_SIZE);
  }, [filteredSortedResults, resultsPage]);

  const stats = useMemo(() => {
    const profitable = results.filter((item) => item.decision === "BUY").length;
    const ungating = results.filter((item) => item.decision === "WORTH UNGATING").length;
    const bad = results.filter(
      (item) =>
        item.decision === "BAD" || item.decision === "LOW_MARGIN" || item.decision === "NO_MARGIN",
    ).length;
    const ungated = results.filter(
      (item) => item.approvalRequired === false && item.listingRestricted === false && !item.restrictedBrand,
    ).length;
    return { profitable, ungating, bad, ungated };
  }, [results]);

  const manualResult = lastRunMode === "manual" && results.length > 0 ? results[0] : null;
  const detailProduct = selectedProduct ?? manualResult;
  const parsedUnitQuantity = parsePositiveInput(projectedMonthlyUnits);
  const detailWholesalePrice =
    detailProduct?.wholesalePrice ?? (parseNonNegativeInput(wholesalePrice) ?? 0);
  const totalBuyCost =
    parsedUnitQuantity !== null ? roundToTwo(detailWholesalePrice * parsedUnitQuantity) : null;
  const projectedProfitForQuantity =
    detailProduct?.netProfit != null && parsedUnitQuantity !== null
      ? roundToTwo(detailProduct.netProfit * parsedUnitQuantity)
      : null;

  function handleSort(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("desc");
  }

  async function handleSelectProduct(item: ProductAnalysis): Promise<void> {
    setPendingProductId(item.id);
    setSelectedProduct(item);
    setPopupQuantity("");
    setDetailPanelCost("");
    setMobileDetailsOpen(true);
    if (item.asin && item.buyBoxPrice == null) {
      setPanelAnalysisLoading(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identifier: item.asin,
            wholesalePrice: parseNonNegativeInput(wholesalePrice) ?? 0,
            brand: item.brand || brand,
            projectedMonthlyUnits: parsePositiveInput(projectedMonthlyUnits) ?? 1,
            sellerType,
            shippingCost: sellerType === "FBM" ? Number(shippingCost) : 0,
          }),
        });
        const json = (await res.json()) as { result?: ProductAnalysis };
        if (res.ok && json.result) {
          const full = json.result as ProductAnalysis;
          full.offerLabel = item.offerLabel ?? full.offerLabel;
          setSelectedProduct(full);
        }
      } catch {
        // keep catalog-only selection
      } finally {
        setPendingProductId(null);
        setPanelAnalysisLoading(false);
      }
      return;
    }
    setPendingProductId(null);
  }

  function applyFileSelection(nextFile: File | null): void {
    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!/\.(xlsx|xls|csv)$/i.test(nextFile.name)) {
      setErrorMessage("Only .xlsx, .xls, or .csv files are accepted.");
      return;
    }

    setErrorMessage(null);
    setFile(nextFile);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>): void {
    if (!bulkUploadEnabled) {
      setInfoMessage("Bulk upload is available on Pro plan.");
      return;
    }
    applyFileSelection(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!bulkUploadEnabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (!bulkUploadEnabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    if (!bulkUploadEnabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    applyFileSelection(event.dataTransfer.files?.[0] ?? null);
  }

  function handleIdentifierChange(nextIdentifier: string): void {
    setIdentifier(nextIdentifier);
    setManualIdentifierResolved(false);
    setBrand("");
    setResults([]);
    setLastRunMode(null);
    lastAutoManualCalcKeyRef.current = "";
    setInfoMessage(null);
    setErrorMessage(null);
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!manualIdentifierResolved) {
      await runManualAnalysis(sellerType, false, undefined, false, true);
      return;
    }

    await runManualAnalysis(sellerType, false);
  }

  async function runUploadAnalysis(selectedSellerType: SellerType, isAutoRerun = false): Promise<void> {
    if (!file) {
      setErrorMessage("Choose an .xlsx, .xls, or .csv file before running upload analysis.");
      return;
    }

    setErrorMessage(null);
    setInfoMessage(isAutoRerun ? `Re-analyzing for ${selectedSellerType}...` : null);
    setIsUploadLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectedMonthlyUnits", projectedMonthlyUnits);
      formData.append("sellerType", selectedSellerType);
      formData.append("shippingCost", selectedSellerType === "FBM" ? shippingCost : "0");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json()) as {
        error?: string;
        results?: ProductAnalysis[];
        parsedRows?: number;
        validRows?: number;
        analyzedRows?: number;
        maxBatchSize?: number;
      };

      if (!response.ok || !json.results) {
        throw new Error(json.error ?? "Upload analysis failed.");
      }

      const resultsList = json.results as ProductAnalysis[];
      const analyzed = json.analyzedRows ?? json.results?.length ?? 0;
      const valid = json.validRows ?? analyzed;
      const total = json.parsedRows ?? 0;
      const maxBatch = json.maxBatchSize ?? 2000;
      let msg: string;
      if (isAutoRerun) {
        msg = `Batch analysis re-analyzed for ${selectedSellerType}.`;
      } else if (valid < total && total > 0) {
        msg = `Analyzed ${analyzed} of ${valid} rows with valid ASIN/UPC/EAN + cost (${total.toLocaleString()} rows in file). Many rows were skipped — ensure the file has identifier and cost columns with correct values.`;
      } else {
        msg = `Analyzed ${analyzed} row${analyzed !== 1 ? "s" : ""}${total > 0 ? ` (up to ${maxBatch} per run)` : ""}.`;
      }
      setInfoMessage(msg);
      setLastRunMode("upload");
      startTransition(() => {
        addProducts(resultsList);
        setResults(resultsList);
        setSelectedProduct(null);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload analysis failed.");
    } finally {
      setIsUploadLoading(false);
    }
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!bulkUploadEnabled) {
      setInfoMessage("Bulk upload is available on Pro plan.");
      return;
    }
    await runUploadAnalysis(sellerType, false);
  }

  async function runKeywordSearch(effectiveKeyword: string, pageSize: number): Promise<void> {
    setErrorMessage(null);
    setInfoMessage(null);
    setIsManualLoading(true);
    try {
      const res = await fetch(
        `/api/analyze/keyword-search?q=${encodeURIComponent(effectiveKeyword)}&pageSize=${pageSize}`,
      );
      const json = (await res.json()) as { ok?: boolean; error?: string; results?: ProductAnalysis[] };
      if (!res.ok || !json.results) {
        throw new Error(json.error ?? "Keyword search failed.");
      }
      const analysisResults = json.results;
      setResults(analysisResults);
      setLastRunMode("manual");
      setManualIdentifierResolved(false);
      setIsKeywordMode(true);
      setLastKeyword(effectiveKeyword);
      if (analysisResults.length > 0) {
        setSelectedProduct(analysisResults[0]);
        setInfoMessage(`${analysisResults.length} products found. Click a row for details.`);
      } else {
        setSelectedProduct(null);
        setInfoMessage("No products found for this keyword.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Keyword search failed.");
    } finally {
      setIsManualLoading(false);
    }
  }

  async function handleLookupSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const effectiveKeyword = keyword.trim();
    if (effectiveKeyword) {
      setKeywordPageSize(20);
      await runKeywordSearch(effectiveKeyword, 20);
      return;
    }
    setIsKeywordMode(false);
    setLastKeyword(null);
    if (!manualIdentifierResolved) {
      await runManualAnalysis(sellerType, false, undefined, false, true);
      return;
    }
    await runManualAnalysis(sellerType, false);
  }

  async function handleSellerTypeChange(nextSellerType: SellerType): Promise<void> {
    if (nextSellerType === sellerType) {
      return;
    }
    setSellerType(nextSellerType);

    if (isManualLoading || isUploadLoading) {
      return;
    }

    if (results.length === 0) {
      return;
    }

    const inferredMode = lastRunMode ?? (file ? "upload" : identifier.trim() ? "manual" : null);
    if (inferredMode === "manual" && identifier.trim()) {
      await runManualAnalysis(nextSellerType, true);
      return;
    }

    if (inferredMode === "upload" && file) {
      await runUploadAnalysis(nextSellerType, true);
    }
  }

  async function handleKeywordLoadMore(): Promise<void> {
    if (!lastKeyword) return;
    const nextSize = Math.min(keywordPageSize + 10, 30);
    if (nextSize === keywordPageSize) return;
    setKeywordPageSize(nextSize);
    await runKeywordSearch(lastKeyword, nextSize);
  }

  async function handleKeywordRefresh(): Promise<void> {
    if (!lastKeyword) return;
    await runKeywordSearch(lastKeyword, keywordPageSize);
  }

  function handleOpenScanner(): void {
    setScannerError(null);
    setScannerRunNonce((current) => current + 1);
    setIsScannerOpen(true);
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    event.target.value = "";

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";

    const cleanup = () => URL.revokeObjectURL(url);

    img.onerror = () => {
      cleanup();
      setErrorMessage("Could not load image.");
    };

    img.onload = async () => {
      try {
        const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (detectorCtor) {
          const detector = new detectorCtor({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
          });
          const detections = await detector.detect(img);
          const value = detections.map((d) => (d as { rawValue?: string }).rawValue?.trim()).find((v) => v && v.length > 0);
          cleanup();
          if (value) {
            setIdentifier(value);
            setManualIdentifierResolved(false);
            setInfoMessage(`Barcode from image: ${value}. Loading product...`);
            void runManualAnalysis(sellerType, false, value, false, true);
          } else {
            setErrorMessage("No barcode found in image.");
          }
          return;
        }
        const zxingModule = await import("@zxing/library");
        const reader = new zxingModule.BrowserMultiFormatReader() as unknown as ZxingReaderLike;
        const result = await reader.decodeFromImageElement(img);
        cleanup();
        if (result) {
          const value = result.getText().trim();
          if (value) {
            setIdentifier(value);
            setManualIdentifierResolved(false);
            setInfoMessage(`Barcode from image: ${value}. Loading product...`);
            void runManualAnalysis(sellerType, false, value, false, true);
          } else {
            setErrorMessage("No barcode found in image.");
          }
        } else {
          setErrorMessage("No barcode found in image.");
        }
      } catch {
        cleanup();
        setErrorMessage("No barcode found in image or decode failed.");
      }
    };

    img.src = url;
  }

  const tableHeaders: Array<{ key: SortColumn; label: string }> = [
    { key: "imageUrl", label: "" },
    { key: "asin", label: "Product" },
    { key: "salesRank", label: "BSR" },
    { key: "brand", label: "Brand" },
  ];

  const rightPanelContent = panelAnalysisLoading ? (
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
        Select a product from the catalog to view details and check selling eligibility.
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
  ) : null;

  function getRightPanelBody(): ReactNode {
    if (rightPanelContent !== null) return rightPanelContent;
    if (!selectedProduct) return null;
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 bg-slate-800 pb-2">
          {selectedProduct.imageUrl ? (
            selectedProduct.asin ? (
              <a
                href={amazonOfferListingUrl(marketplaceDomain, selectedProduct.asin)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this product on Amazon (use Buying options / Other sellers there to compare offers)"
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
                title="Open this product on Amazon (use Buying options / Other sellers there to compare offers)"
                className="font-medium text-slate-100 underline decoration-slate-500 underline-offset-2 transition hover:text-teal-300 hover:decoration-teal-300"
              >
                {selectedProduct.title || selectedProduct.asin || "Product"}
              </a>
            ) : (
              <p className="font-medium text-slate-100">{selectedProduct.title || selectedProduct.asin || "Product"}</p>
            )}
            {selectedProduct.asin ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                On Amazon, use <span className="text-slate-400">Buying options</span> or{" "}
                <span className="text-slate-400">Other sellers</span> on that page to see who is selling this ASIN.
              </p>
            ) : null}
            {selectedProduct.offerLabel ? (
              <p className="text-sm text-teal-400">Listing: {selectedProduct.offerLabel}</p>
            ) : null}
            {selectedProduct.brand ? <p className="text-sm text-slate-400">Brand: {selectedProduct.brand}</p> : null}
            {selectedProduct.asin ? (
              <p className="text-xs text-slate-500">ASIN: {selectedProduct.asin}</p>
            ) : null}
            {selectedProduct.salesRankCategory ? (
              <p className="text-xs text-slate-500">Category: {selectedProduct.salesRankCategory}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClasses(selectedProduct.decision)}`}>
              {decisionDisplayLabel(selectedProduct.decision)}
            </span>
            {(() => {
              const explanation = decisionExplanation(selectedProduct);
              return explanation ? (
                <span className="text-sm text-slate-400">— {explanation}</span>
              ) : null;
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
              onClick={() => void handleSellerTypeChange("FBA")}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition ${sellerType === "FBA" ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              FBA
            </button>
            <button
              type="button"
              onClick={() => void handleSellerTypeChange("FBM")}
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
                  const netP = detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost)) && selectedProduct.buyBoxPrice != null && selectedProduct.totalFees != null
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
                  const cost = detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
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
                  const cost = detailPanelCost.trim() !== "" && Number.isFinite(parseFloat(detailPanelCost))
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
              {selectedProduct.error ? (
                <p className="mt-1 text-sm text-rose-300">{selectedProduct.error}</p>
              ) : null}
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

          <ProductInsightBlurb
            product={selectedProduct}
            sessionSignedIn={Boolean(session?.user)}
            amazonConnected={amazonHeaderConnected}
            onConnectAmazon={() => setShowAmazonAccountModal(true)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      {(isManualLoading || isUploadLoading || panelAnalysisLoading) && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
        </div>
      )}
      {showAmazonAccountModal && (
        <AmazonAccountModal onClose={() => setShowAmazonAccountModal(false)} />
      )}
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

      <form
        onSubmit={handleLookupSubmit}
        className="shrink-0 rounded-xl border border-slate-600/80 bg-slate-800/90 p-6 shadow-lg shadow-black/10"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Keyword</span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search by product name, brand…"
              className="mt-1 block w-full max-w-md rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Lookup by ASIN, UPC, or EAN</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={identifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="B000123456 or 012345678901"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            />
            <button
              type="button"
              onClick={handleOpenScanner}
              className="shrink-0 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-all"
            >
              Scan
            </button>
            <label className="shrink-0 cursor-pointer rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-all">
              Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </label>
            <button
              type="submit"
              disabled={isManualLoading}
              className="shrink-0 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-50 transition-all"
            >
              {isManualLoading ? "Loading…" : manualIdentifierResolved ? "Calculate profit" : "Lookup"}
            </button>
          </div>
        </label>
        </div>
      </form>

      {errorMessage ? (
        <div className="shrink-0 rounded-lg border border-rose-800 bg-rose-900/30 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}
      {infoMessage ? (
        <div className="shrink-0 rounded-lg border border-emerald-800 bg-emerald-900/30 px-4 py-3 text-sm text-emerald-300">
          {infoMessage}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-4">
      <section className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {lastRunMode === "upload" ? "Batch summary" : "Lookup results"}
          </span>
          <span className="text-slate-300">
            Total: <span className="font-semibold text-slate-100">{results.length}</span>
          </span>
          {lastRunMode === "upload" ? (
            <span className="text-teal-400">
              Ungated: <span className="font-semibold">{stats.ungated}</span>
            </span>
          ) : null}
          <span className="text-emerald-400">
            Buy: <span className="font-semibold">{stats.profitable}</span>
          </span>
          <span className="text-amber-400">
            Ungate: <span className="font-semibold">{stats.ungating}</span>
          </span>
          <span className="text-rose-400">
            Skip: <span className="font-semibold">{stats.bad}</span>
          </span>
        </div>
      </section>

      <section className="flex min-w-0 flex-col rounded-xl border border-slate-700 bg-slate-800/90 shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-300">
              View
            <select
              value={viewFilter}
              onChange={(event) => setViewFilter(event.target.value as ViewFilter)}
              className="ml-2 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
            >
              <option value="all">All products</option>
              <option value="buy_now">Buy now (profitable)</option>
              <option value="ungated">Ungated / Eligible only</option>
              <option value="ungate_profitable">Ungate (profitable but gated)</option>
              <option value="restricted">Restricted / Approval required</option>
              <option value="needs_review">Needs review (undecided)</option>
            </select>
          </label>
            {lastRunMode === "upload" ? (
              <button
                type="button"
                onClick={() => setViewFilter("ungated")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  viewFilter === "ungated"
                    ? "bg-teal-600 text-white"
                    : "border border-slate-600 bg-slate-700/50 text-slate-300 hover:bg-slate-600"
                }`}
              >
                Ungated only
              </button>
            ) : null}
            {lastRunMode === "upload" ? (
              <button
                type="button"
                onClick={() => void handleSellerTypeChange(sellerType === "FBA" ? "FBM" : "FBA")}
                disabled={isUploadLoading}
                className="rounded-full border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 disabled:opacity-50"
              >
                {sellerType} → Switch to {sellerType === "FBA" ? "FBM" : "FBA"}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-400">
            Showing {filteredSortedResults.length} of {results.length}
            {filteredSortedResults.length > RESULTS_PAGE_SIZE
              ? ` · Page ${resultsPage} of ${totalPages} (${RESULTS_PAGE_SIZE} per page)`
              : ""}
            {" · "}
            <span className="max-lg:hidden">Click a row for details in the right panel</span>
            <span className="lg:hidden">Tap a row for product details</span>
          </p>
          {isKeywordMode && lastKeyword && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleKeywordRefresh()}
                disabled={isManualLoading}
                className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleKeywordLoadMore()}
                disabled={isManualLoading || keywordPageSize >= 30}
                className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                Load more
              </button>
            </div>
          )}
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-700/50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header.key} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort(header.key)}
                      className="inline-flex items-center gap-1 font-semibold text-slate-300 hover:text-slate-100"
                    >
                      {header.label}
                      <span className="text-[10px]">
                        {sortColumn === header.key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedResults.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                    No products match the selected view filter.
                  </td>
                </tr>
              ) : (
                displayedResults.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => void handleSelectProduct(item)}
                    className={`cursor-pointer border-t border-slate-700 transition hover:bg-slate-700/30 ${selectedProduct?.id === item.id || pendingProductId === item.id ? "ring-2 ring-inset ring-teal-400" : ""}`}
                  >
                    <td className="px-3 py-1.5">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title || "Product"}
                          title={item.title || undefined}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded border border-slate-600 object-contain bg-slate-700/30"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-slate-600 bg-slate-700/50 text-slate-500 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="max-w-[280px]">
                        <p className="truncate font-medium text-[13px] text-slate-200" title={item.title || undefined}>
                          {item.title || item.asin || item.inputIdentifier || "—"}
                        </p>
                        {item.offerLabel ? (
                          <p className="text-[11px] text-slate-500">{item.offerLabel}</p>
                        ) : item.asin ? (
                          <p className="text-[11px] text-slate-500">ASIN: {item.asin}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-300">{formatNumber(item.salesRank)}</td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-300">{item.brand || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-700 px-4 py-3">
            <button
              type="button"
              onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
              disabled={resultsPage <= 1}
              className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-400">
              Page {resultsPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setResultsPage((p) => Math.min(totalPages, p + 1))}
              disabled={resultsPage >= totalPages}
              className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </section>
        </div>
      ) : null}

      <details className="group shrink-0 rounded-xl border border-slate-700 bg-slate-800/90 shadow-sm">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-slate-300 hover:bg-slate-700/50 [&::-webkit-details-marker]:hidden">
          Bulk upload
        </summary>
        <div className="border-t border-slate-700 p-6 pt-4 space-y-6">
          {!bulkUploadEnabled ? (
            <p className="rounded-lg border border-slate-600 bg-slate-700/40 px-3 py-2 text-xs text-slate-300">
              Bulk upload is available on Pro plan.
            </p>
          ) : null}

      <form onSubmit={handleUploadSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload Wholesale File</h2>
        <p className="mt-1 text-sm text-slate-600">
          Include ASIN, UPC, or EAN plus wholesale cost per unit.
        </p>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-4 rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging ? "border-sky-400 bg-sky-50" : "border-slate-300 bg-slate-50"
          } ${bulkUploadEnabled ? "" : "pointer-events-none opacity-60"}`}
        >
          <p className="text-sm text-slate-700">{file ? file.name : "Drag and drop .xlsx/.xls/.csv here"}</p>
          <p className="mt-1 text-xs text-slate-500">or</p>
          <label className={`mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 ${bulkUploadEnabled ? "cursor-pointer hover:bg-slate-100" : "cursor-not-allowed opacity-70"}`}>
            Select File
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} disabled={!bulkUploadEnabled} />
          </label>
        </div>

        <button
          type="submit"
          disabled={isUploadLoading || !bulkUploadEnabled}
          className="mt-5 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploadLoading ? "Analyzing File..." : "Run Batch Analysis"}
        </button>
      </form>

        </div>
      </details>

      {isScannerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">Scan Product Barcode</h3>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 p-4">
              <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black" muted playsInline />
              {scannerError ? (
                <p className="text-sm text-rose-700">{scannerError}</p>
              ) : (
                <p className="text-sm text-slate-600">
                  Point your camera at a barcode (UPC/EAN). The scanner will auto-fill the identifier field.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Stop Scanner
                </button>
                <button
                  type="button"
                  onClick={() => setScannerRunNonce((current) => current + 1)}
                  className="rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-teal-500/20 hover:from-teal-400 hover:to-cyan-500"
                >
                  Restart Scanner
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>

      {mobileDetailsOpen ? (
        <button
          type="button"
          aria-label="Dismiss product details"
          className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileDetailsOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed flex min-h-0 flex-col overflow-hidden border-l border-slate-700 bg-slate-800 shadow-xl transition-transform duration-300 ease-out max-lg:inset-x-0 max-lg:top-0 max-lg:z-[100] max-lg:h-[100svh] max-lg:max-h-[100svh] max-lg:w-full max-lg:max-w-none ${
          mobileDetailsOpen ? "max-lg:translate-x-0" : "max-lg:pointer-events-none max-lg:translate-x-full"
        } lg:static lg:z-auto lg:h-full lg:max-h-full lg:w-80 lg:shrink-0 lg:translate-x-0 lg:rounded-l-xl xl:w-96`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-3 max-lg:py-0 max-lg:pb-3 max-lg:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4">
              <h3 className="min-w-0 truncate text-base font-semibold text-slate-100">Product details</h3>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileDetailsOpen(false);
                    setSelectedProduct(null);
                    setPopupQuantity("");
                    setDetailPanelCost("");
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-xl leading-none text-slate-100 hover:bg-slate-600 lg:hidden"
                  aria-label="Close and return to Analyzer"
                >
                  <span aria-hidden>×</span>
                </button>
                {selectedProduct ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProduct(null);
                      setPopupQuantity("");
                      setDetailPanelCost("");
                      setMobileDetailsOpen(false);
                    }}
                    className="hidden rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-600 lg:inline-flex"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
            <div className="px-4 pb-4 pt-3 text-[13px] text-slate-200 lg:p-4">{getRightPanelBody()}</div>
          </div>
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
