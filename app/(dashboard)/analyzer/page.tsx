"use client";
/* eslint-disable @next/next/no-img-element */

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
import { DashboardHeaderMark } from "@/app/components/DashboardHeaderMark";
import { ProductInsightBlurb } from "@/app/components/ProductInsightBlurb";
import { ProductIntelPanelContent } from "@/app/components/ProductIntelPanelContent";
import { useProductAiInsight } from "@/app/hooks/useProductAiInsight";
import { AmazonAccountModal } from "@/app/settings/AmazonAccountModal";
import { useOpenDashboardSettings } from "@/app/context/DashboardSettingsContext";
import { useSavedProducts } from "@/app/context/SavedProductsContext";
import { amazonSellerStorefrontUrl } from "@/lib/marketplaces";
import { SellerListDialog, buildSellerModalState, type SellerModalState } from "@/app/components/SellerListDialog";
import { appHeaderCompact, appHeaderSuffix } from "@/lib/appBranding";
import type { ProductAnalysis, SellerType } from "@/lib/types";
import {
  trackProductSearch,
  trackProductDetailView,
  trackKeywordSearch,
  trackBulkUploadStart,
  trackBulkUploadComplete,
  trackBarcodeScanOpen,
  trackAiInsightView,
  trackError,
} from "@/lib/analytics";

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

type ManualAnalysisRunner = (
  selectedSellerType: SellerType,
  isAutoRerun?: boolean,
  identifierOverride?: string,
  isScannerTriggered?: boolean,
  lookupOnly?: boolean,
) => Promise<void>;

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

/** Formats we try for camera + still images (QR/Datamatrix help with "photo of label" cases). */
const BARCODE_DETECTOR_FORMATS = [
  "aztec",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "data_matrix",
  "ean_13",
  "ean_8",
  "itf",
  "pdf417",
  "qr_code",
  "upc_a",
  "upc_e",
] as const;

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
  decodeFromStream?: (
    stream: MediaStream,
    videoSource: string | HTMLVideoElement,
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

function formatNumber(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString();
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

/** Normalize scanner payloads (raw barcode text, URL, or mixed content) into a lookup identifier. */
function normalizeScannedIdentifier(input: string): string {
  const base = normalizeLookupInput(input).trim();
  if (!base) return "";

  const digits = base.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 14) {
    return digits;
  }

  const asinLike = base.toUpperCase().match(/[A-Z0-9]{10}/g) ?? [];
  for (const token of asinLike) {
    if (/[A-Z]/.test(token) && /\d/.test(token)) {
      return token;
    }
  }

  return base;
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

const MATCH_GROUP_ORDER: Record<string, number> = {
  exact: 0,
  variation: 1,
  multipack: 2,
  possible_related: 3,
};

function compareValues(
  a: ProductAnalysis,
  b: ProductAnalysis,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): number {
  // When results have matchGroup (scan/photo flow), always sort by group first:
  // exact → variation → multipack → possible_related. User sort applies within each group.
  const aGroup = a.matchGroup ? (MATCH_GROUP_ORDER[a.matchGroup] ?? 9) : null;
  const bGroup = b.matchGroup ? (MATCH_GROUP_ORDER[b.matchGroup] ?? 9) : null;
  if (aGroup !== null && bGroup !== null && aGroup !== bGroup) {
    return aGroup - bGroup;
  }

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
  const { addProducts, getByAsin } = useSavedProducts();
  const openDashboardSettings = useOpenDashboardSettings();
  const { data: session } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [keyword, setKeyword] = useState("");
  const [wholesalePrice] = useState("0");
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
  const [scanPhase, setScanPhase] = useState<"idle" | "scanning" | "capturing" | "analyzing">("idle");
  const [mobileBulkOpen, setMobileBulkOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [manualIdentifierResolved, setManualIdentifierResolved] = useState(false);
  const [marketplaceDomain, setMarketplaceDomain] = useState("amazon.com");
  /** From GET /api/config — OPENAI_API_KEY set on server (never exposes the key). */
  const [photoSearchAvailable, setPhotoSearchAvailable] = useState<boolean | null>(null);
  const [amazonOnListingEnabled, setAmazonOnListingEnabled] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysis | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  /** Popover on lg+; full-height sheet from the right on smaller screens (mirrors left nav direction). */
  const [, setPopupQuantity] = useState("");
  const [sellerModal, setSellerModal] = useState<SellerModalState>(null);
  const [sellerSheetVisible, setSellerSheetVisible] = useState(false);
  const [panelAnalysisLoading, setPanelAnalysisLoading] = useState(false);
  const [detailPanelCost, setDetailPanelCost] = useState("");
  const [resultsPage, setResultsPage] = useState(1);
  const [showAmazonAccountModal, setShowAmazonAccountModal] = useState(false);
  const [amazonHeaderConnected, setAmazonHeaderConnected] = useState(false);
  const [amazonHeaderTitle, setAmazonHeaderTitle] = useState<string | null>(null);
  const [subscriptionPaid, setSubscriptionPaid] = useState<boolean | undefined>(undefined);
  const [bulkUploadEnabled, setBulkUploadEnabled] = useState(false);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Hidden element used when moving the live stream from "park" to the visible preview (mobile decode quirks). */
  const scannerParkVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<ZxingReaderLike | null>(null);
  const hasScannedRef = useRef(false);
  const isScanLoadingRef = useRef(false);
  /** Latest handler for auto photo fallback (set after `captureScannerFrameAndSearch` is defined). */
  const captureScannerFrameAndSearchRef = useRef<() => Promise<void>>(async () => {});
  const photoSearchAvailableRef = useRef<boolean | null>(null);
  const lastAutoManualCalcKeyRef = useRef("");
  const scannerPreferredDeviceIdRef = useRef<string | null>(null);
  const sellerTypeRef = useRef<SellerType>(sellerType);
  const runManualAnalysisRef = useRef<ManualAnalysisRunner | null>(null);
  const isManualLoadingRef = useRef(isManualLoading);
  const isUploadLoadingRef = useRef(isUploadLoading);

  const { llmInsight, llmLoading, llmError } = useProductAiInsight(selectedProduct, photoSearchAvailable);

  const fetchWithTimeout = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit, timeoutMs = 25000): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...init, signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [],
  );

  useEffect(() => {
    if (llmInsight) {
      trackAiInsightView({ asin: selectedProduct?.asin ?? undefined });
    }
  }, [llmInsight, selectedProduct?.asin]);

  const openSellerModal = useCallback((e: MouseEvent<HTMLButtonElement>, filter: "all" | "FBA" | "FBM") => {
    setSellerModal(buildSellerModalState(e, filter));
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
  }, [results.length, viewFilter, lastRunMode]);

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
      .then(
        (overview: {
          proBulkEntitled?: boolean;
          subscriptionStatus?: string;
          appOwnerAccess?: boolean;
          billingDisabled?: boolean;
          testingBillingPass?: boolean;
          promoDaysLeft?: number;
        } | null) => {
          setBulkUploadEnabled(Boolean(overview?.proBulkEntitled));
          if (overview) {
            const paid =
              overview.appOwnerAccess ||
              overview.billingDisabled ||
              overview.testingBillingPass ||
              overview.subscriptionStatus === "active" ||
              overview.subscriptionStatus === "trialing" ||
              (typeof overview.promoDaysLeft === "number" && overview.promoDaysLeft > 0);
            setSubscriptionPaid(Boolean(paid));
          }
        },
      )
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

  /** Full teardown: stop camera hardware (use on restart, photo capture, leaving the page, or replacing a dead stream). */
  const disposeScannerMedia = useCallback(() => {
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
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (scannerParkVideoRef.current) {
      scannerParkVideoRef.current.pause();
      scannerParkVideoRef.current.srcObject = null;
    }
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    hasScannedRef.current = false;
  }, []);

  const stopScanner = disposeScannerMedia;

  const acquireScannerStream = useCallback(async (): Promise<boolean> => {
    if (!window.isSecureContext) {
      setScannerError(
        "Camera is blocked on insecure pages. Open this app on https:// or on http://localhost, then allow camera permission.",
      );
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Camera access is not available in this browser.");
      return false;
    }

    const existing = scannerStreamRef.current;
    const videoTrack = existing?.getVideoTracks()[0];
    if (videoTrack && videoTrack.readyState === "live") {
      videoTrack.enabled = true;
      return true;
    }

    if (scannerStreamRef.current) {
      disposeScannerMedia();
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: scannerPreferredDeviceIdRef.current
          ? { deviceId: { ideal: scannerPreferredDeviceIdRef.current } }
          : { facingMode: { ideal: "environment" } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const deviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
      if (deviceId) {
        scannerPreferredDeviceIdRef.current = deviceId;
      }
      scannerStreamRef.current = stream;
      return true;
    } catch (error) {
      setScannerError(error instanceof Error ? error.message : "Unable to access camera.");
      return false;
    }
  }, [disposeScannerMedia]);

  const runManualAnalysis = useCallback(
    async (
      selectedSellerType: SellerType,
      isAutoRerun = false,
      identifierOverride?: string,
      isScannerTriggered = false,
      lookupOnly = false,
    ): Promise<void> => {
      void isAutoRerun;
      const effectiveIdentifier = isScannerTriggered
        ? normalizeScannedIdentifier(identifierOverride ?? identifier)
        : normalizeLookupInput(identifierOverride ?? identifier);
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
        const runSingleAnalysis = async (): Promise<ProductAnalysis[]> => {
          const singleResponse = await fetchWithTimeout("/api/analyze", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
          });
          const singleJson = (await singleResponse.json()) as { error?: string; result?: ProductAnalysis };
          if (!singleResponse.ok || !singleJson.result) {
            throw new Error(singleJson.error ?? "Manual analysis failed.");
          }
          return [singleJson.result as ProductAnalysis];
        };

        let analysisResults: ProductAnalysis[];

        if (lookupOnly && isScannerTriggered) {
          // Step 1 – exact barcode identification
          const barcodeResponse = await fetchWithTimeout("/api/analyze/barcode-scan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifier: effectiveIdentifier }),
          });
          const barcodeJson = (await barcodeResponse.json()) as {
            ok?: boolean;
            error?: string;
            results?: ProductAnalysis[];
          };
          if (!barcodeResponse.ok || !barcodeJson.results?.length) {
            setManualIdentifierResolved(false);
            setResults([]);
            setErrorMessage(null);
            setInfoMessage(
              "Product not found for this barcode. Try Search by photo or enter ASIN/keyword.",
            );
            return;
          }

          const catalogResults = barcodeJson.results;
          const exactAsin = catalogResults[0]?.asin;

          // Step 2 – full analysis on the exact ASIN so the detail panel gets prices/decisions
          let enrichedResults: ProductAnalysis[] = catalogResults;
          if (exactAsin) {
            try {
              const analyzeRes = await fetchWithTimeout("/api/analyze", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  identifier: exactAsin,
                  wholesalePrice: parsedWholesalePrice ?? 0,
                  brand,
                  projectedMonthlyUnits: parsedProjectedUnits ?? 1,
                  sellerType: selectedSellerType,
                  shippingCost: selectedSellerType === "FBM" ? Number(shippingCost) : 0,
                }),
              });
              const analyzeJson = (await analyzeRes.json()) as { result?: ProductAnalysis; error?: string };
              if (analyzeRes.ok && analyzeJson.result) {
                enrichedResults = [analyzeJson.result, ...catalogResults.slice(1)];
              }
            } catch {
              // Full analysis failed; keep catalog result so the panel still shows something
            }
          }

          setManualIdentifierResolved(true);
          setResults(enrichedResults);
          addProducts(enrichedResults);

          setSelectedProduct(null);
          setMobileDetailsOpen(false);

          setViewFilter("all");
          setLastRunMode("manual");
          setInfoMessage(null);
          trackProductSearch({ identifier: effectiveIdentifier, lookup_only: false });
          return;
        } else {
          if (!amazonHeaderConnected) {
            analysisResults = await runSingleAnalysis();
          } else {
          const variationsResponse = await fetchWithTimeout("/api/analyze/variations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifier: effectiveIdentifier }),
          });
          const variationsJson = (await variationsResponse.json()) as {
            ok?: boolean;
            error?: string;
            results?: ProductAnalysis[];
          };

          if (variationsResponse.ok && variationsJson.results && variationsJson.results.length > 0) {
            analysisResults = variationsJson.results;
          } else {
            const offersResponse = await fetchWithTimeout("/api/analyze/offers", {
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
                analysisResults = await runSingleAnalysis();
              }
            }
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
          addProducts(analysisResults);
          setSelectedProduct(null);
          setMobileDetailsOpen(false);
          setDetailPanelCost("");
          setViewFilter("all");
          setLastRunMode("manual");
          setInfoMessage(null);
          return;
        }

        setManualIdentifierResolved(true);
        setResults(analysisResults);
        addProducts(analysisResults);
        setSelectedProduct(null);
        setMobileDetailsOpen(false);

        trackProductSearch({ identifier: effectiveIdentifier, lookup_only: lookupOnly });
        setInfoMessage(null);
        if (analysisResult.error) {
          setErrorMessage(analysisResult.error);
        }
        setLastRunMode("manual");
      } catch (error) {
        trackError({ error_type: "manual_analysis", error_message: error instanceof Error ? error.message : undefined });
        setErrorMessage(error instanceof Error ? error.message : "Manual lookup failed.");
      } finally {
        setIsManualLoading(false);
      }
    },
    [identifier, wholesalePrice, brand, projectedMonthlyUnits, shippingCost, addProducts, amazonHeaderConnected, fetchWithTimeout],
  );

  const refetchManualRowAnalysis = useCallback(
    async (row: ProductAnalysis, isAutoRerun = false, sellerTypeOverride?: SellerType) => {
      const asin = row.asin;
      if (!asin) {
        return;
      }

      const parsedWholesalePrice = parseNonNegativeInput(wholesalePrice);
      const parsedProjectedUnits = parsePositiveInput(projectedMonthlyUnits);
      if (parsedWholesalePrice === null || parsedProjectedUnits === null) {
        return;
      }

      const effectiveSellerType = sellerTypeOverride ?? sellerType;

      setErrorMessage(null);
      if (!isAutoRerun) {
        setInfoMessage(null);
      }
      setIsManualLoading(true);
      try {
        const res = await fetchWithTimeout("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            identifier: asin,
            wholesalePrice: parsedWholesalePrice,
            brand: row.brand || brand,
            projectedMonthlyUnits: parsedProjectedUnits,
            sellerType: effectiveSellerType,
            shippingCost: effectiveSellerType === "FBM" ? Number(shippingCost) : 0,
          }),
        });
        const json = (await res.json()) as { error?: string; result?: ProductAnalysis };
        if (!res.ok || !json.result) {
          throw new Error(json.error ?? "Analysis failed.");
        }
        const full = json.result as ProductAnalysis;
        full.offerLabel = row.offerLabel ?? full.offerLabel;
        // Preserve scan-flow fields that the deep analysis endpoint does not return.
        if (row.matchGroup) full.matchGroup = row.matchGroup;
        if (row.matchReason) full.matchReason = row.matchReason;
        if (row.hasCatalogVariationFamily === true) full.hasCatalogVariationFamily = true;

        setResults((prev) =>
          prev.map((p) =>
            p.id === row.id ? { ...full, id: p.id, offerLabel: p.offerLabel ?? full.offerLabel } : p,
          ),
        );
        setSelectedProduct((prev) =>
          prev && prev.id === row.id
            ? { ...full, id: prev.id, offerLabel: prev.offerLabel ?? full.offerLabel }
            : prev,
        );

        if (full.error) {
          setErrorMessage(full.error);
        }
        setLastRunMode("manual");
        lastAutoManualCalcKeyRef.current = [
          row.id,
          row.asin,
          effectiveSellerType,
          shippingCost,
          parsedWholesalePrice.toString(),
          parsedProjectedUnits.toString(),
        ].join("|");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Analysis failed.");
      } finally {
        setIsManualLoading(false);
      }
    },
    [wholesalePrice, projectedMonthlyUnits, brand, sellerType, shippingCost, fetchWithTimeout],
  );

  const syncLastAutoManualCalcKeyForRow = useCallback(
    (row: ProductAnalysis) => {
      const parsedWholesalePrice = parseNonNegativeInput(wholesalePrice);
      const parsedProjectedUnits = parsePositiveInput(projectedMonthlyUnits);
      if (parsedWholesalePrice === null || parsedProjectedUnits === null || !row.asin) {
        return;
      }
      lastAutoManualCalcKeyRef.current = [
        row.id,
        row.asin,
        sellerType,
        shippingCost,
        parsedWholesalePrice.toString(),
        parsedProjectedUnits.toString(),
      ].join("|");
    },
    [wholesalePrice, projectedMonthlyUnits, sellerType, shippingCost],
  );

  sellerTypeRef.current = sellerType;
  runManualAnalysisRef.current = runManualAnalysis;
  isManualLoadingRef.current = isManualLoading;
  isUploadLoadingRef.current = isUploadLoading;
  photoSearchAvailableRef.current = photoSearchAvailable;

  useEffect(() => {
    if (!isScannerOpen) {
      disposeScannerMedia();
      setScanPhase((prev) => (prev === "scanning" ? "idle" : prev));
      return;
    }

    const stream = scannerStreamRef.current;
    if (!stream) {
      setScannerError("Camera failed to start. Close and try Scan again.");
      setIsScannerOpen(false);
      return;
    }

    setScannerError(null);
    hasScannedRef.current = false;
    let cancelled = false;
    let detectionErrorShown = false;
    let attachAttempts = 0;

    const applyScannedValue = (scannedValue: string): void => {
      if (!scannedValue || cancelled || hasScannedRef.current) {
        return;
      }
      const normalizedScanned = normalizeScannedIdentifier(scannedValue);
      if (!normalizedScanned) {
        return;
      }
      hasScannedRef.current = true;
      setIdentifier(normalizedScanned);
      setManualIdentifierResolved(false);
      setBrand("");
      setResults([]);
      setLastRunMode(null);
      lastAutoManualCalcKeyRef.current = "";
      setErrorMessage(null);

      if (isManualLoadingRef.current || isUploadLoadingRef.current) {
        setIsScannerOpen(false);
        setInfoMessage(`Scanned identifier: ${normalizedScanned}. Finish current run, then continue.`);
        return;
      }

      // Freeze the camera frame so user sees the still while we analyze.
      if (videoRef.current) videoRef.current.pause();
      isScanLoadingRef.current = true;
      setScanPhase("analyzing");
      const run = runManualAnalysisRef.current;
      if (run) {
        void run(sellerTypeRef.current, false, normalizedScanned, true, true).finally(() => {
          isScanLoadingRef.current = false;
          setScanPhase("idle");
          setIsScannerOpen(false);
          disposeScannerMedia();
        });
      }
    };

    const startDecodeOnVideo = async (video: HTMLVideoElement): Promise<void> => {
      try {
        const park = scannerParkVideoRef.current;
        if (park && park.srcObject === stream) {
          park.pause();
          park.srcObject = null;
        }
        video.srcObject = stream;
        await video.play();

        const onZXingResult = (result: ZxingScanResultLike | undefined, error?: ZxingScanErrorLike): void => {
          if (cancelled || hasScannedRef.current) return;
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
        };

        const startZXingDecode = async (): Promise<void> => {
          if (cancelled || hasScannedRef.current) return;
          const zxingModule = await import("@zxing/library");
          if (cancelled || hasScannedRef.current) return;
          // TRY_HARDER (hint key 2) enables multi-angle scanning in ZXing so barcodes
          // held sideways or upside-down are detected without any special orientation.
          const hints = new Map<number, unknown>([[2, true]]);
          const zxingReader = new (zxingModule.BrowserMultiFormatReader as unknown as new (h: Map<number, unknown>) => ZxingReaderLike)(hints);
          zxingReaderRef.current = zxingReader;
          if (zxingReader.decodeFromStream) {
            await zxingReader.decodeFromStream(stream, video, onZXingResult);
          } else {
            await zxingReader.decodeFromVideoDevice(null, video, onZXingResult);
          }
        };

        const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

        if (!detectorCtor) {
          await startZXingDecode();
          return;
        }

        const detector = new detectorCtor({ formats: [...BARCODE_DETECTOR_FORMATS] });
        let nativeDetectFailCount = 0;
        let frameCount = 0;

        // Try the same frame rotated at 90°, 180°, 270° — catches barcodes
        // held sideways, upside-down, or at any angle.
        const detectRotated = async (video: HTMLVideoElement): Promise<string | null> => {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return null;
          for (const angleDeg of [90, 180, 270]) {
            const swapped = angleDeg === 90 || angleDeg === 270;
            const canvas = document.createElement("canvas");
            canvas.width = swapped ? h : w;
            canvas.height = swapped ? w : h;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((angleDeg * Math.PI) / 180);
            ctx.drawImage(video, -w / 2, -h / 2);
            try {
              const hits = await detector.detect(canvas);
              const val = hits.map((e) => e.rawValue?.trim() ?? "").find((v) => v.length > 0);
              if (val) return val;
            } catch {
              // ignore per-rotation failures
            }
          }
          return null;
        };

        const scanLoop = async (): Promise<void> => {
          if (cancelled || hasScannedRef.current || !videoRef.current) return;

          try {
            if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
              const detections = await detector.detect(videoRef.current);
              nativeDetectFailCount = 0;
              const scannedValue = detections
                .map((entry) => entry.rawValue?.trim() ?? "")
                .find((value) => value.length > 0);
              if (scannedValue) {
                applyScannedValue(scannedValue);
                return;
              }
              // Every 10 frames also try rotated orientations so barcodes held
              // sideways, upside-down, or at any angle are detected.
              frameCount++;
              if (frameCount % 10 === 0) {
                const rotatedValue = await detectRotated(videoRef.current);
                if (rotatedValue && !hasScannedRef.current) {
                  applyScannedValue(rotatedValue);
                  return;
                }
              }
            }
          } catch {
            nativeDetectFailCount++;
            if (nativeDetectFailCount >= 15) {
              // BarcodeDetector consistently failing — fall back to ZXing.
              void startZXingDecode();
              return;
            }
          }

          scannerFrameRef.current = window.requestAnimationFrame(() => {
            void scanLoop();
          });
        };

        scannerFrameRef.current = window.requestAnimationFrame(() => {
          void scanLoop();
        });
      } catch (error) {
        if (cancelled) return;
        setScannerError(error instanceof Error ? error.message : "Unable to start scanner preview.");
      }
    };

    const tryAttach = (): void => {
      if (cancelled) {
        return;
      }
      const video = videoRef.current;
      if (!video) {
        attachAttempts += 1;
        if (attachAttempts > 120) {
          setScannerError("Camera view failed to load.");
          setIsScannerOpen(false);
          return;
        }
        scannerFrameRef.current = window.requestAnimationFrame(tryAttach);
        return;
      }
      void startDecodeOnVideo(video);
    };

    tryAttach();

    let autoPhotoTimerId: number | null = null;
    if (photoSearchAvailableRef.current === true) {
      autoPhotoTimerId = window.setTimeout(() => {
        if (!cancelled && !hasScannedRef.current) {
          void captureScannerFrameAndSearchRef.current();
        }
      }, 4000);
    }

    return () => {
      cancelled = true;
      if (autoPhotoTimerId !== null) window.clearTimeout(autoPhotoTimerId);
      disposeScannerMedia();
    };
  }, [isScannerOpen, disposeScannerMedia]);

  useEffect(() => {
    return () => {
      disposeScannerMedia();
    };
  }, [disposeScannerMedia]);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data: { marketplaceDomain?: string; photoSearchAvailable?: boolean; amazonOnListingEnabled?: boolean }) => {
        if (data.marketplaceDomain) setMarketplaceDomain(data.marketplaceDomain);
        if (typeof data.photoSearchAvailable === "boolean") {
          setPhotoSearchAvailable(data.photoSearchAvailable);
        }
        if (typeof data.amazonOnListingEnabled === "boolean") {
          setAmazonOnListingEnabled(data.amazonOnListingEnabled);
        }
      })
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (!manualIdentifierResolved) {
      lastAutoManualCalcKeyRef.current = "";
      return;
    }

    if (!selectedProduct?.asin) {
      lastAutoManualCalcKeyRef.current = "";
      return;
    }

    if (isManualLoading || isUploadLoading || isScannerOpen || !identifier.trim()) {
      return;
    }

    if (pendingProductId || panelAnalysisLoading) {
      return;
    }

    const parsedWholesalePrice = parseNonNegativeInput(wholesalePrice);
    const parsedProjectedUnits = parsePositiveInput(projectedMonthlyUnits);
    if (parsedWholesalePrice === null || parsedProjectedUnits === null) {
      return;
    }

    const autoCalcKey = [
      selectedProduct.id,
      selectedProduct.asin,
      sellerType,
      shippingCost,
      parsedWholesalePrice.toString(),
      parsedProjectedUnits.toString(),
    ].join("|");
    if (lastAutoManualCalcKeyRef.current === autoCalcKey) {
      return;
    }

    const rowSnapshot = selectedProduct;
    const rerunTimer = window.setTimeout(() => {
      lastAutoManualCalcKeyRef.current = autoCalcKey;
      void refetchManualRowAnalysis(rowSnapshot, true);
    }, 800);

    return () => {
      window.clearTimeout(rerunTimer);
    };
  }, [
    wholesalePrice,
    projectedMonthlyUnits,
    manualIdentifierResolved,
    selectedProduct,
    isManualLoading,
    isUploadLoading,
    isScannerOpen,
    identifier,
    sellerType,
    shippingCost,
    pendingProductId,
    panelAnalysisLoading,
    refetchManualRowAnalysis,
  ]);

  const filteredSortedResults = useMemo(() => {
    const base =
      lastRunMode === "upload"
        ? results.filter((item) => matchesViewFilter(item, viewFilter))
        : [...results];
    return base.sort((left, right) => compareValues(left, right, sortColumn, sortDirection));
  }, [results, lastRunMode, viewFilter, sortColumn, sortDirection]);

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
    trackProductDetailView({ asin: item.asin ?? undefined, decision: item.decision ?? undefined });
    setMobileDetailsOpen(true);
    if (item.asin && item.buyBoxPrice == null) {
      let settledRow: ProductAnalysis = item;
      setPanelAnalysisLoading(true);
      try {
        const res = await fetchWithTimeout("/api/analyze", {
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
          settledRow = { ...full, id: item.id, offerLabel: full.offerLabel };
          setSelectedProduct(settledRow);
          // Keep the visible list stable while enriching a clicked row.
          setResults((prev) => prev.map((row) => (row.id === item.id ? { ...settledRow, id: row.id } : row)));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setErrorMessage("Product details timed out. Please tap the product again.");
        }
        // keep catalog-only selection
      } finally {
        setPendingProductId(null);
        setPanelAnalysisLoading(false);
        syncLastAutoManualCalcKeyForRow(settledRow);
      }
      return;
    }
    setPendingProductId(null);
    syncLastAutoManualCalcKeyForRow(item);
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

  async function runUploadAnalysis(selectedSellerType: SellerType, isAutoRerun = false): Promise<void> {
    if (!file) {
      setErrorMessage("Choose an .xlsx, .xls, or .csv file before running upload analysis.");
      return;
    }

    setErrorMessage(null);
    setInfoMessage(isAutoRerun ? `Re-analyzing for ${selectedSellerType}...` : null);
    setIsUploadLoading(true);
    trackBulkUploadStart({ file_name: file.name, seller_type: selectedSellerType });

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
      trackBulkUploadComplete({
        analyzed_rows: analyzed,
        valid_rows: valid,
        total_rows: total,
      });
      setInfoMessage(msg);
      setLastRunMode("upload");
      setMobileBulkOpen(false);
      startTransition(() => {
        addProducts(resultsList);
        setResults(resultsList);
        setSelectedProduct(null);
      });
    } catch (error) {
      trackError({ error_type: "bulk_upload", error_message: error instanceof Error ? error.message : undefined });
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
      trackKeywordSearch({ keyword: effectiveKeyword, result_count: analysisResults.length });
      setResults(analysisResults);
      setLastRunMode("manual");
      setManualIdentifierResolved(false);
      setIsKeywordMode(true);
      setLastKeyword(effectiveKeyword);
      setViewFilter("all");
      if (analysisResults.length > 0) {
        setSelectedProduct(null);
        setMobileDetailsOpen(false);
        setInfoMessage(null);
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

  async function runImageProductSearchFromFile(
    imageFile: File,
    pageSize = 20,
    decodedBarcode?: string | null,
  ): Promise<ProductAnalysis[] | null> {
    if (photoSearchAvailable !== true) {
      setErrorMessage(
        "Photo search is not enabled on this server (needs OPENAI_API_KEY). Use barcode, keyword, or ASIN.",
      );
      return null;
    }
    setErrorMessage(null);
    setInfoMessage(null);
    setIsManualLoading(true);
    let foundResults: ProductAnalysis[] | null = null;
    try {
      const form = new FormData();
      form.append("image", imageFile);
      form.append("pageSize", String(pageSize));
      const digits = decodedBarcode?.replace(/\D/g, "").trim() ?? "";
      if (digits.length >= 8 && digits.length <= 14) {
        form.append("barcode", digits);
      }
      const res = await fetchWithTimeout("/api/analyze/image-search", { method: "POST", body: form }, 35000);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        results?: ProductAnalysis[];
        derivedQuery?: string | null;
        notFoundOnAmazon?: boolean;
        notice?: string;
        imageUnclear?: boolean;
        matchPath?: "barcode" | "family";
      };
      if (!res.ok || json.results === undefined) {
        throw new Error(json.error ?? "Photo search failed.");
      }
      const analysisResults = json.results;
      const derived = json.derivedQuery?.trim() ?? "";
      setResults(analysisResults);
      setLastRunMode("manual");
      setManualIdentifierResolved(false);
      setIsKeywordMode(true);
      if (derived) {
        setLastKeyword(derived);
      } else {
        setLastKeyword(null);
      }
      setKeywordPageSize(pageSize);
      setViewFilter("all");
      setIdentifier("");
      if (analysisResults.length > 0) {
        setSelectedProduct(null);
        setMobileDetailsOpen(false);
        const matchedLabel =
          json.matchPath === "barcode"
            ? "Matched by barcode on the package."
            : derived
              ? `Matched by product family: ${derived}`
              : null;
        setInfoMessage(matchedLabel);
        foundResults = analysisResults;
      } else {
        setSelectedProduct(null);
        if (json.notice) {
          setInfoMessage(json.notice);
        } else if (json.imageUnclear) {
          setInfoMessage("Unable to confidently identify the product. Please rescan.");
        } else if (json.notFoundOnAmazon) {
          setInfoMessage("This product does not appear to be listed on Amazon yet.");
        } else if (derived) {
          setInfoMessage(
            `No listings for "${derived}". Try a clearer photo, the barcode, or a keyword.`,
          );
        } else {
          setInfoMessage("Unable to confidently identify the product. Please rescan.");
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMessage("Photo search timed out. Try a clearer photo or scan barcode.");
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Photo search failed.");
      }
    } finally {
      setIsManualLoading(false);
    }
    return foundResults;
  }

  async function captureScannerFrameAndSearch(): Promise<void> {
    if (isScanLoadingRef.current) {
      return;
    }
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setScannerError("Wait for the camera preview, then try again.");
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setScannerError("Camera is not ready yet.");
      return;
    }
    setScannerError(null);
    setScanPhase("capturing");
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setScannerError("Could not capture frame.");
      setScanPhase("idle");
      return;
    }
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.88);
    });
    if (!blob) {
      setScannerError("Could not capture frame.");
      setScanPhase("idle");
      return;
    }
    const imageFile = new File([blob], "camera-product.jpg", { type: "image/jpeg" });
    // Freeze the captured frame so user sees it while we analyze.
    if (videoRef.current) videoRef.current.pause();
    isScanLoadingRef.current = true;
    setScanPhase("analyzing");
    await runImageProductSearchFromFile(imageFile);
    isScanLoadingRef.current = false;
    setScanPhase("idle");
    setIsScannerOpen(false);
    stopScanner();
  }

  captureScannerFrameAndSearchRef.current = captureScannerFrameAndSearch;

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
    await runManualAnalysis(sellerType);
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
      if (selectedProduct?.asin) {
        await refetchManualRowAnalysis(selectedProduct, true, nextSellerType);
      } else {
        await runManualAnalysis(nextSellerType);
      }
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

  async function handleOpenScanner(): Promise<void> {
    setScannerError(null);
    setScanPhase("scanning");
    const ok = await acquireScannerStream();
    if (ok) {
      setIsScannerOpen(true);
      trackBarcodeScanOpen();
    } else {
      setScanPhase("idle");
    }
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
      let decodedCode: string | null = null;
      try {
        const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (detectorCtor) {
          const detector = new detectorCtor({
            formats: [...BARCODE_DETECTOR_FORMATS],
          });
          const detections = await detector.detect(img);
          decodedCode =
            detections
              .map((d) => (d as { rawValue?: string }).rawValue?.trim())
              .find((v) => v && v.length > 0) ?? null;
        }
        if (!decodedCode) {
          const zxingModule = await import("@zxing/library");
          const reader = new zxingModule.BrowserMultiFormatReader() as unknown as ZxingReaderLike;
          const result = await reader.decodeFromImageElement(img);
          const value = result?.getText().trim();
          if (value) {
            decodedCode = value;
          }
        }
      } catch {
        // Fall through to photo-based catalog search.
      }

      cleanup();
      if (decodedCode) {
        setIdentifier(decodedCode);
        setManualIdentifierResolved(false);
        if (photoSearchAvailable === true) {
          setInfoMessage(`Code from image: ${decodedCode}. Looking up product and same-line variations…`);
          await runImageProductSearchFromFile(file, 20, decodedCode);
        } else {
          setInfoMessage(`Code from image: ${decodedCode}. Loading product...`);
          void runManualAnalysis(sellerType, false, decodedCode, true, true);
        }
        return;
      }
      if (photoSearchAvailable === false) {
        setErrorMessage(
          "Could not read a barcode from this image, and photo search is off (server needs OPENAI_API_KEY). Try another angle or use keyword / ASIN.",
        );
        return;
      }
      await runImageProductSearchFromFile(file);
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
    <div className="flex flex-col gap-3">
      <div className="hf-analyzing-caption pl-0.5">Analyzing product…</div>
      {/* Image skeleton */}
      <div className="skeleton-shimmer h-32 w-full rounded-lg" />
      {/* Title lines skeleton */}
      <div className="space-y-2 px-0.5">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded" />
        <div className="skeleton-shimmer h-3 w-1/2 rounded opacity-75" />
        <div className="skeleton-shimmer h-3 w-2/3 rounded opacity-50" />
      </div>
      {/* Badge skeleton */}
      <div className="skeleton-shimmer h-6 w-20 rounded-full" />
      {/* Info card skeleton */}
      <div className="skeleton-shimmer h-12 w-full rounded-lg" />
      {/* Stat cards skeleton */}
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
      {/* Premium empty state */}
      <div className="hf-detail-empty-card flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 px-5 py-9 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-800/60">
          <svg className="h-7 w-7 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="18" y="3" width="4" height="18" rx="1" />
            <rect x="10" y="8" width="4" height="13" rx="1" />
            <rect x="2"  y="13" width="4" height="8"  rx="1" />
            <path d="M2 21h20" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">Search or scan a product to analyze</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Enter an ASIN, UPC, or keyword above to view eligibility, offers, fees, and profit estimates.
          </p>
        </div>
      </div>
      {/* Skeleton stat cards */}
      <div className="grid grid-cols-2 gap-2">
        {["BSR", "Buy Box", "FBA / FBM", "Cost", "Profit", "ROI"].map((label) => (
          <div key={label} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 transition-colors hover:bg-slate-800/60">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <div className="skeleton-shimmer h-4 w-10 rounded" />
          </div>
        ))}
      </div>
    </div>
  ) : null;

  function getRightPanelBody(): ReactNode {
    if (rightPanelContent !== null) return rightPanelContent;
    if (!selectedProduct) return null;
    return (
      <ProductIntelPanelContent
        product={selectedProduct}
        marketplaceDomain={marketplaceDomain}
        sellerType={sellerType}
        onSellerTypeChange={(next) => {
          void handleSellerTypeChange(next);
        }}
        detailPanelCost={detailPanelCost}
        onDetailPanelCostChange={setDetailPanelCost}
        shippingCost={shippingCost}
        onShippingCostChange={setShippingCost}
        projectedMonthlyUnits={projectedMonthlyUnits}
        onProjectedMonthlyUnitsChange={setProjectedMonthlyUnits}
        openSellerModal={openSellerModal}
        variationDetail="analyzer"
        amazonConnected={amazonHeaderConnected}
        amazonOnListingEnabled={amazonOnListingEnabled}
      >
        <ProductInsightBlurb
          product={selectedProduct}
          sessionSignedIn={Boolean(session?.user)}
          openaiConfigured={photoSearchAvailable}
          llmInsight={llmInsight}
          llmLoading={llmLoading}
          llmError={llmError}
        />
      </ProductIntelPanelContent>
    );
  }

  const bulkUploadInner = (
    <div className="space-y-6">
      {!bulkUploadEnabled ? (
        <p className="rounded-lg border border-slate-600 bg-slate-700/40 px-3 py-2 text-xs text-slate-300">
          Bulk upload is available on Pro plan.
        </p>
      ) : null}

      <form onSubmit={handleUploadSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload Wholesale File</h2>
        <p className="mt-1 text-sm text-slate-600">Include ASIN, UPC, or EAN plus wholesale cost per unit.</p>

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
          <label
            className={`mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 ${bulkUploadEnabled ? "cursor-pointer hover:bg-slate-100" : "cursor-not-allowed opacity-70"}`}
          >
            Select File
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileInput}
              disabled={!bulkUploadEnabled}
            />
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
  );

  const bulkUploadPanel = (
    <details className="group shrink-0 rounded-xl border border-slate-700 bg-slate-800/90 shadow-sm">
      <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-slate-300 hover:bg-slate-700/50 [&::-webkit-details-marker]:hidden">
        Bulk upload
      </summary>
      <div className="border-t border-slate-700 p-6 pt-4">{bulkUploadInner}</div>
    </details>
  );

  return (
    <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
      <video
        ref={scannerParkVideoRef}
        className="pointer-events-none fixed bottom-0 left-0 h-px w-px max-h-[1px] max-w-[1px] opacity-0"
        muted
        playsInline
        aria-hidden
      />
      {/* Global loading spinner (excludes scan — scan shows its own in-scanner overlay). */}
      {(isManualLoading || isUploadLoading || panelAnalysisLoading) && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            <p className="text-xs font-medium text-slate-200">
              {isScanLoadingRef.current ? "Scanning product..." : "Loading..."}
            </p>
          </div>
        </div>
      )}
      {showAmazonAccountModal && (
        <AmazonAccountModal
          onClose={() => setShowAmazonAccountModal(false)}
          isPaidPlan={subscriptionPaid}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:gap-6 sm:p-6 sm:pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:overflow-hidden lg:pb-6">
        <header className="hf-dash-brand-header invert-exempt hidden shrink-0 rounded-xl border border-slate-600/80 border-t-4 border-t-teal-500 px-3 py-2 md:block sm:px-4 sm:py-2 lg:px-5 lg:py-2.5">
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
              onClick={() => void handleOpenScanner()}
              disabled={scanPhase === "scanning"}
              className="shrink-0 rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600 transition-all disabled:opacity-60 disabled:cursor-wait"
            >
              {scanPhase === "scanning" ? "Starting…" : "Scan"}
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
              className="hf-primary-cta shrink-0 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-500 disabled:opacity-50 transition-all"
            >
              {isManualLoading ? "Loading…" : "Lookup"}
            </button>
          </div>
          {photoSearchAvailable === false ? (
            <p className="mt-2 text-xs text-amber-200/90">
              Photo / AI product search is off until{" "}
              <span className="rounded bg-slate-700/80 px-1 font-mono text-[11px] text-slate-200">OPENAI_API_KEY</span> is
              set on the server. Barcode scan, upload (code-first), keyword, and ASIN lookup still work.
            </p>
          ) : photoSearchAvailable === true ? (
            <p className="mt-2 text-xs text-slate-500">
              <span className="text-slate-400">Scan</span> is exact barcode match (no guess fallback).{" "}
              <span className="text-slate-400">Upload image</span> also uses photo search.
            </p>
          ) : null}
        </label>
        </div>
      </form>

      {/* Camera / scanner error shown when camera acquisition failed and modal never opened */}
      {scannerError && !isScannerOpen ? (
        <div className="shrink-0 flex items-start gap-2 rounded-lg border border-rose-700/50 bg-rose-900/20 px-4 py-3 text-sm text-rose-300">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span className="flex-1">{scannerError}</span>
          <button
            type="button"
            onClick={() => setScannerError(null)}
            className="ml-2 shrink-0 text-rose-400 hover:text-rose-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}
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

      <div
        className={`flex min-h-0 min-w-0 flex-col ${
          results.length > 0
            ? "max-lg:shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden"
            : "flex-1"
        }`}
      >
      {results.length > 0 ? (
      <section className="flex min-h-0 min-w-0 max-lg:shrink-0 flex-col rounded-xl border border-slate-600/80 bg-slate-800/90 shadow-lg shadow-black/10 lg:flex-1 lg:overflow-hidden">
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-slate-600/80 bg-slate-800/50 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {lastRunMode === "upload" ? "Batch summary" : "Lookup results"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                <span className="text-slate-300">{results.length}</span> listings
              </span>
              {lastRunMode === "upload" ? (
                <span className="text-teal-400">
                  Ungated: <span className="font-medium text-slate-200">{stats.ungated}</span>
                </span>
              ) : null}
              <span className="text-emerald-400">
                Buy: <span className="font-medium text-slate-200">{stats.profitable}</span>
              </span>
              <span className="text-amber-400">
                Ungate: <span className="font-medium text-slate-200">{stats.ungating}</span>
              </span>
              <span className="text-rose-400">
                Skip: <span className="font-medium text-slate-200">{stats.bad}</span>
              </span>
            </div>
          </div>
        </div>

        <div
          className={`flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-600/80 px-3 py-3 ${
            lastRunMode === "upload" ? "justify-between" : "justify-end"
          }`}
        >
          {lastRunMode === "upload" ? (
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
              <button
                type="button"
                onClick={() => void handleSellerTypeChange(sellerType === "FBA" ? "FBM" : "FBA")}
                disabled={isUploadLoading}
                className="rounded-full border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 disabled:opacity-50"
              >
                {sellerType} → Switch to {sellerType === "FBA" ? "FBM" : "FBA"}
              </button>
            </div>
          ) : null}
          <p className="text-xs text-slate-400">
            Showing {filteredSortedResults.length} of {results.length}
            {filteredSortedResults.length > RESULTS_PAGE_SIZE
              ? ` · Page ${resultsPage} of ${totalPages} (${RESULTS_PAGE_SIZE} per page)`
              : ""}
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
        <div className="flex flex-col gap-2 px-2 pb-2 lg:hidden">
          {displayedResults.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">
              {lastRunMode === "upload"
                ? "No products match the selected view filter."
                : "No listings to show."}
            </p>
          ) : (
            displayedResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handleSelectProduct(item)}
                className={`flex w-full gap-3 rounded-lg border border-slate-600 bg-slate-800/80 p-3 text-left transition hover:bg-slate-700/50 ${
                  selectedProduct?.id === item.id || pendingProductId === item.id
                    ? "ring-2 ring-inset ring-teal-400"
                    : ""
                }`}
              >
                <div className="shrink-0">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-14 w-14 rounded border border-slate-600 object-contain bg-slate-700/30"
                    />
                  ) : (
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded border border-slate-600 bg-slate-700/50 text-slate-500 text-[11px]">
                      —
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-slate-100">
                    {item.title || item.asin || item.inputIdentifier || "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {item.asin ? <span>ASIN {item.asin}</span> : null}
                    <span>BSR {formatNumber(item.salesRank)}</span>
                    <span>{item.brand || "—"}</span>
                  </div>
                  {item.offerLabel ? <p className="mt-0.5 text-[11px] text-slate-500">{item.offerLabel}</p> : null}
                </div>
              </button>
            ))
          )}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-4 border-t border-slate-600/80 px-2 py-3">
              <button
                type="button"
                onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                disabled={resultsPage <= 1}
                className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto overscroll-y-contain pb-14 md:pb-3">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] border-b border-slate-600/80 bg-slate-700/95 text-xs uppercase tracking-wide text-slate-400 backdrop-blur-sm">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header.key} className="bg-slate-700/95 px-3 py-3">
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
                {amazonOnListingEnabled && (
                  <th className="bg-slate-700/95 px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-300 whitespace-nowrap">
                    Amazon?
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayedResults.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                    {lastRunMode === "upload"
                      ? "No products match the selected view filter."
                      : "No listings to show."}
                  </td>
                </tr>
              ) : (
                displayedResults.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => void handleSelectProduct(item)}
                    className={`cursor-pointer border-t border-slate-700 transition hover:bg-slate-700/30 ${selectedProduct?.id === item.id ? "bg-slate-700/50 ring-2 ring-inset ring-teal-400" : pendingProductId === item.id ? "animate-pulse bg-teal-950/30 ring-2 ring-inset ring-teal-400/60" : ""}`}
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
                    <td className="px-3 py-1.5">
                      {item.salesRank != null ? (
                        <>
                          <p className="text-[13px] tabular-nums text-slate-300">#{formatNumber(item.salesRank)}</p>
                          {item.salesRankCategory && (
                            <p className="text-[10px] leading-snug text-slate-500">in {item.salesRankCategory}</p>
                          )}
                        </>
                      ) : <span className="text-[13px] text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-[13px] text-slate-300">{item.brand || "—"}</td>
                    {amazonOnListingEnabled && (
                      <td className="px-3 py-1.5 text-[13px] whitespace-nowrap">
                        {(() => {
                          const ids = item.sellerIds ?? [];
                          const details = item.sellerDetails ?? [];
                          if (ids.includes("ATVPDKIKX0DER") || details.some((d) => d.sellerId === "ATVPDKIKX0DER")) {
                            return <span className="font-semibold text-rose-400">⚠️ YES</span>;
                          }
                          return <span className="cursor-help text-slate-500" title="SP-API does not expose Amazon's own retail offer.">?</span>;
                        })()}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalPages > 1 ? (
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
          ) : null}
          <div className="border-t border-slate-600/80 px-1 pt-4">{bulkUploadPanel}</div>
        </div>
        </div>
      </section>
      ) : null}
      </div>

      {results.length === 0 ? <div className="hidden shrink-0 lg:block">{bulkUploadPanel}</div> : null}

      <div className="fixed bottom-0 left-0 right-0 z-[44] border-t border-slate-700/90 bg-slate-900/95 backdrop-blur-md lg:hidden">
        <div className="flex items-stretch gap-2 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => setMobileBulkOpen(true)}
            className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-teal-500/45 bg-teal-500/15 px-3 text-sm font-semibold text-teal-100 shadow-sm transition hover:bg-teal-500/25"
          >
            Bulk upload
          </button>
          <button
            type="button"
            onClick={() => openDashboardSettings()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg leading-none text-slate-200 shadow-md transition hover:border-teal-500/50 hover:bg-slate-700 hover:text-teal-200"
            aria-label="Settings"
            title="Settings"
          >
            <span aria-hidden>⚙</span>
          </button>
        </div>
      </div>

      {mobileBulkOpen ? (
        <>
          <button
            type="button"
            aria-label="Close bulk upload"
            className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-[1px] lg:hidden"
            onClick={() => setMobileBulkOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[100] max-h-[min(90dvh,42rem)] overflow-y-auto overflow-x-hidden rounded-t-2xl border border-slate-600 border-b-0 bg-slate-800 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-2xl lg:hidden">
            <div className="flex items-center justify-between gap-2 border-b border-slate-600/80 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Bulk upload</h3>
              <button
                type="button"
                onClick={() => setMobileBulkOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-700 text-xl leading-none text-slate-100 hover:bg-slate-600"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="pt-4">{bulkUploadInner}</div>
          </div>
        </>
      ) : null}

      {isScannerOpen ? (
        /* Mobile: full-screen black / Desktop (md+): centered card over blurred overlay */
        <div className="fixed inset-0 z-50 bg-black md:flex md:items-center md:justify-center md:bg-black/75 md:backdrop-blur-sm">
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-black md:h-auto md:w-full md:max-w-3xl md:rounded-2xl md:shadow-2xl md:shadow-black/60">

            {/* Camera feed — fills screen on mobile, 16:9 card on desktop */}
            <video
              ref={videoRef}
              className="h-full w-full object-cover md:aspect-video md:h-auto"
              muted
              playsInline
            />

            {/* ── Viewfinder guide ── */}
            {/* Subtle dark surround panels that frame the scan zone */}
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/50" style={{ height: "22%" }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50" style={{ height: "30%" }} />
            <div className="pointer-events-none absolute left-0 bg-black/50" style={{ top: "22%", width: "7%", height: "48%" }} />
            <div className="pointer-events-none absolute right-0 bg-black/50" style={{ top: "22%", width: "7%", height: "48%" }} />

            {/* Corner brackets + scan line — sized to the clear viewfinder zone */}
            <div
              className="pointer-events-none absolute"
              style={{ top: "22%", left: "7%", width: "86%", height: "48%" }}
            >
              {/* Corners */}
              <div className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-l-[3px] border-t-[3px] border-teal-400" style={{ filter: "drop-shadow(0 0 6px rgba(45,212,191,0.7))" }} />
              <div className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-r-[3px] border-t-[3px] border-teal-400" style={{ filter: "drop-shadow(0 0 6px rgba(45,212,191,0.7))" }} />
              <div className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-b-[3px] border-l-[3px] border-teal-400" style={{ filter: "drop-shadow(0 0 6px rgba(45,212,191,0.7))" }} />
              <div className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-b-[3px] border-r-[3px] border-teal-400" style={{ filter: "drop-shadow(0 0 6px rgba(45,212,191,0.7))" }} />
              {/* Sweeping scan line (relative to this box) */}
              <div
                className="pointer-events-none absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent"
                style={{ boxShadow: "0 0 10px 3px rgba(45,212,191,0.6)", animation: "scanLine 2s ease-in-out infinite" }}
              />
            </div>

            {/* Hint text just above the viewfinder */}
            <div className="pointer-events-none absolute left-0 right-0 flex justify-center" style={{ top: "15%" }}>
              <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">
                Point at barcode or product
              </span>
            </div>

            {/* Status pill just below the viewfinder */}
            <div className="pointer-events-none absolute left-0 right-0 flex justify-center" style={{ top: "72%" }}>
              <span className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-1.5 text-xs font-medium text-teal-300 backdrop-blur-sm">
                {(scanPhase === "analyzing" || scanPhase === "capturing") ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-[2px] border-teal-400 border-t-transparent" />
                    Identifying product…
                  </>
                ) : (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
                    </span>
                    {photoSearchAvailable === true ? "Scanning · tap below for photo" : "Looking for barcode…"}
                  </>
                )}
              </span>
            </div>

            {/* Error toast */}
            {scannerError && (
              <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-xs px-4" style={{ top: "13%" }}>
                <p className="rounded-xl bg-rose-950/90 px-4 py-2.5 text-sm text-rose-300 text-center shadow-lg backdrop-blur-sm">{scannerError}</p>
              </div>
            )}

            {/* ── Top bar ── */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/65 to-transparent">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                </span>
                <span className="text-sm font-semibold tracking-wide text-white">Scan Product</span>
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                aria-label="Close scanner"
              >
                ✕
              </button>
            </div>

            {/* ── Bottom bar ── */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-8 pb-10 pt-6 bg-gradient-to-t from-black/70 to-transparent md:pb-6">

              {/* Restart — icon-only circle, left */}
              <button
                type="button"
                onClick={() => {
                  setIsScannerOpen(false);
                  setScannerError(null);
                  disposeScannerMedia();
                  void (async () => {
                    const ok = await acquireScannerStream();
                    if (ok) setIsScannerOpen(true);
                  })();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20"
                title="Restart camera"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H5.498a.75.75 0 00-.75.75v3.744a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V3.427a.75.75 0 00-1.5 0V5.89l-.31-.31A7 7 0 003.239 8.717a.75.75 0 001.448.389A5.5 5.5 0 0113.89 6.64l.311.31h-2.432a.75.75 0 000 1.5h3.744a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Photo search — large shutter-style button, center */}
              <button
                type="button"
                onClick={() => { void captureScannerFrameAndSearchRef.current(); }}
                disabled={photoSearchAvailable !== true || scanPhase === "capturing" || scanPhase === "analyzing"}
                title={photoSearchAvailable !== true ? "Needs OPENAI_API_KEY on the server" : "Search by photo"}
                className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-white/80 bg-transparent shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {(scanPhase === "capturing" || scanPhase === "analyzing") ? (
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
                ) : (
                  <span className="h-14 w-14 rounded-full bg-white shadow-inner" />
                )}
              </button>

              {/* Spacer to balance layout */}
              <div className="h-11 w-11" />
            </div>

          </div>
        </div>
      ) : null}
      <style>{`
        @keyframes scanLine {
          0%   { top: 8%;  opacity: 1; }
          48%  { top: 88%; opacity: 1; }
          50%  { top: 88%; opacity: 0; }
          52%  { top: 8%;  opacity: 0; }
          54%  { top: 8%;  opacity: 1; }
          100% { top: 8%;  opacity: 1; }
        }
      `}</style>
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
        className={`product-details-panel fixed flex min-h-0 flex-col overflow-hidden border-l border-slate-700 bg-slate-800 shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] max-lg:inset-x-0 max-lg:top-0 max-lg:z-[100] max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:w-full max-lg:max-w-none ${
          mobileDetailsOpen ? "max-lg:translate-x-0" : "max-lg:pointer-events-none max-lg:translate-x-full"
        } lg:static lg:z-auto lg:h-full lg:max-h-full lg:w-80 lg:shrink-0 lg:translate-x-0 lg:rounded-l-xl xl:w-96`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-3 max-lg:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-4">
            <h3 className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Product Details</h3>
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
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] [-webkit-overflow-scrolling:touch]">
            <div className="px-3 pb-1 pt-2 text-[13px] leading-snug text-slate-200 lg:px-3.5 lg:pb-2 lg:pt-2.5">
              {getRightPanelBody()}
            </div>
          </div>
          {selectedProduct ? (
            <SellerListDialog
              sellerModal={sellerModal}
              sellerSheetVisible={sellerSheetVisible}
              selectedProduct={selectedProduct}
              marketplaceDomain={marketplaceDomain}
              onClose={() => setSellerModal(null)}
              renderSellerRow={(s) => (
                <a
                  href={amazonSellerStorefrontUrl(marketplaceDomain, s.sellerId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-1 rounded-lg border border-slate-600/80 bg-slate-700/50 px-3 py-2 text-xs outline-none transition hover:border-slate-500 hover:bg-slate-600/45 focus-visible:ring-2 focus-visible:ring-teal-400"
                  title={`View products from seller ${s.sellerId} on Amazon`}
                  onClick={(ev) => ev.stopPropagation()}
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
                    <span className="shrink-0 rounded bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">{s.channel}</span>
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
              )}
            />
          ) : null}
        </div>
      </aside>
      </div>

    </div>
  );
}
