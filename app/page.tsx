"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

import type { ProductAnalysis, SellerType } from "@/lib/types";

type SortColumn =
  | "inputIdentifier"
  | "imageUrl"
  | "asin"
  | "brand"
  | "sellerType"
  | "buyBoxPrice"
  | "wholesalePrice"
  | "shippingCost"
  | "totalFees"
  | "netProfit"
  | "roiPercent"
  | "salesRank"
  | "decision";

type SortDirection = "asc" | "desc";
type ViewFilter = "all" | "buy_now" | "ungate_profitable" | "restricted" | "needs_review";

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
    return "bg-emerald-50";
  }
  if (color === "yellow") {
    return "bg-amber-50";
  }
  return "bg-rose-50";
}

function decisionDisplayLabel(decision: ProductAnalysis["decision"]): string {
  const labels: Record<ProductAnalysis["decision"], string> = {
    BUY: "Buy",
    "WORTH UNGATING": "Worth ungating",
    LOW_MARGIN: "Low margin",
    NO_MARGIN: "No margin",
    BAD: "Bad",
    UNKNOWN: "Unknown",
  };
  return labels[decision] ?? decision;
}

function decisionBadgeClasses(decision: ProductAnalysis["decision"]): string {
  if (decision === "BUY") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (decision === "WORTH UNGATING") {
    return "bg-amber-100 text-amber-800";
  }
  if (decision === "LOW_MARGIN") {
    return "bg-orange-100 text-orange-800";
  }
  if (decision === "NO_MARGIN" || decision === "BAD") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-slate-100 text-slate-700";
}

function buildAiInsight(item: ProductAnalysis): string {
  if (item.error) {
    return "Data connection issue. Re-run this item and verify account/API credentials.";
  }

  if (item.approvalRequired || item.listingRestricted || item.restrictedBrand) {
    return "Listing/gating risk detected. Check approvals and ungating docs before buying.";
  }

  if (item.netProfit === null || item.roiPercent === null || item.buyBoxPrice === null) {
    return "Incomplete market data. Validate buy box and fee data before making a sourcing decision.";
  }

  if (item.decision === "BUY") {
    const base =
      item.amazonIsSeller === true
        ? "Profitable but Amazon is on listing. Watch buy box share and price volatility."
        : "Strong candidate. Profit and ROI are acceptable with current market snapshot.";
    return `${base} Verify the product exists in your Seller Central (Inventory > Add a product) before sourcing.`;
  }

  if (item.decision === "WORTH UNGATING") {
    return "Potentially attractive after ungating. Confirm docs and post-ungating margin stability.";
  }

  if (item.decision === "LOW_MARGIN") {
    return "Margin is thin. Negotiate lower cost, reduce shipping, or skip.";
  }

  if (item.decision === "NO_MARGIN") {
    return "No margin or deficit. Do not source at current costs.";
  }

  return "Needs deeper review: compare offer depth, rank trend, and competition before buying.";
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

export default function Home() {
  const [identifier, setIdentifier] = useState("");
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
  const [sortColumn, setSortColumn] = useState<SortColumn>("netProfit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [lastRunMode, setLastRunMode] = useState<"manual" | "upload" | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerRunNonce, setScannerRunNonce] = useState(0);
  const [manualIdentifierResolved, setManualIdentifierResolved] = useState(false);
  const [marketplaceDomain, setMarketplaceDomain] = useState("amazon.com");
  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysis | null>(null);
  const [popupQuantity, setPopupQuantity] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<ZxingReaderLike | null>(null);
  const hasScannedRef = useRef(false);
  const lastAutoManualCalcKeyRef = useRef("");

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
      const effectiveIdentifier = (identifierOverride ?? identifier).trim();
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

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            identifier: effectiveIdentifier,
          wholesalePrice: lookupOnly ? 0 : parsedWholesalePrice ?? 0,
          brand,
          projectedMonthlyUnits: lookupOnly ? 1 : parsedProjectedUnits ?? 1,
            sellerType: selectedSellerType,
            shippingCost: selectedSellerType === "FBM" ? Number(shippingCost) : 0,
          }),
        });

        const json = (await response.json()) as { error?: string; result?: ProductAnalysis };
        if (!response.ok || !json.result) {
          throw new Error(json.error ?? "Manual analysis failed.");
        }

        const analysisResult = json.result as ProductAnalysis;
        const detectedBrand = analysisResult.brand?.trim() ?? "";
        if (detectedBrand) {
          setBrand(detectedBrand);
        }

        if (lookupOnly) {
          if (analysisResult.error || !analysisResult.asin) {
            setManualIdentifierResolved(false);
            setResults([analysisResult]);
            setErrorMessage(analysisResult.error ?? "Unable to load product data from Amazon for this identifier.");
            setInfoMessage(null);
            return;
          }

          setManualIdentifierResolved(true);
          setResults([analysisResult]);
          setSelectedProduct(null);
          setLastRunMode("manual");
          setInfoMessage(
            isScannerTriggered
              ? `Scanned ${effectiveIdentifier}. Product found. Continue with cost and units.`
              : "Product found. Continue with cost and units.",
          );
          return;
        }

        setManualIdentifierResolved(true);
        setSelectedProduct(null);

        if (isAutoRerun) {
          setResults([analysisResult]);
          setInfoMessage(`Manual lookup re-analyzed for ${selectedSellerType}.`);
        } else {
          setResults([analysisResult]);
          setInfoMessage(isScannerTriggered ? "Scanned and analyzed successfully." : "Manual lookup complete.");
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

  const stats = useMemo(() => {
    const profitable = results.filter((item) => item.decision === "BUY").length;
    const ungating = results.filter((item) => item.decision === "WORTH UNGATING").length;
    const bad = results.filter(
      (item) =>
        item.decision === "BAD" || item.decision === "LOW_MARGIN" || item.decision === "NO_MARGIN",
    ).length;
    return { profitable, ungating, bad };
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
    applyFileSelection(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
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
        analyzedRows?: number;
      };

      if (!response.ok || !json.results) {
        throw new Error(json.error ?? "Upload analysis failed.");
      }

      setResults(json.results);
      setSelectedProduct(null);
      setInfoMessage(
        isAutoRerun
          ? `Batch analysis re-analyzed for ${selectedSellerType}.`
          : `Analyzed ${json.analyzedRows ?? json.results.length} rows from ${json.parsedRows ?? 0} uploaded rows.`,
      );
      setLastRunMode("upload");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload analysis failed.");
    } finally {
      setIsUploadLoading(false);
    }
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runUploadAnalysis(sellerType, false);
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

  function handleOpenScanner(): void {
    setScannerError(null);
    setScannerRunNonce((current) => current + 1);
    setIsScannerOpen(true);
  }

  const tableHeaders: Array<{ key: SortColumn; label: string }> = [
    { key: "imageUrl", label: "" },
    { key: "asin", label: "Product" },
    { key: "salesRank", label: "BSR" },
    { key: "decision", label: "Decision" },
  ];

  return (
    <div className="flex min-h-screen w-full">
      <main className={`flex-1 min-w-0 flex flex-col gap-6 p-6 ${!selectedProduct ? "mx-auto max-w-7xl" : "mr-0 lg:mr-80 xl:mr-96"}`}>
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Amazon FBA/FBM Wholesale Sourcing Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload wholesale catalogs or search a single ASIN/UPC, then evaluate Buy Box pricing, fees, ROI, and ungating opportunity.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Data from Amazon ({marketplaceDomain}). If you can&apos;t find a product in Seller Central, check that your MARKETPLACE_ID matches your seller account region. No Buy Box = no offers in that marketplace (out of stock, restricted, or not listed).
        </p>
      </header>

      <form onSubmit={handleManualSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Manual Single Lookup</h2>
        <p className="mt-1 text-sm text-slate-600">Enter or scan ASIN/UPC first.</p>

        <div className="mt-4 grid gap-3">
          <label className="text-sm font-medium text-slate-700">
            ASIN or UPC/EAN
            <div className="mt-1 flex gap-2">
              <input
                value={identifier}
                onChange={(event) => handleIdentifierChange(event.target.value)}
                placeholder="B000123456 or 012345678901"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                required
              />
              <button
                type="button"
                onClick={handleOpenScanner}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Scan Barcode
              </button>
            </div>
          </label>

        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!manualIdentifierResolved ? (
            <button
              type="submit"
              disabled={isManualLoading}
              className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isManualLoading ? "Loading Product..." : "Get Product Data"}
            </button>
          ) : null}
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">Fulfillment</span>
          <button
            type="button"
            onClick={() => {
              void handleSellerTypeChange(sellerType === "FBA" ? "FBM" : "FBA");
            }}
            className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            aria-label="Toggle fulfillment mode"
          >
            {sellerType === "FBA" ? "FBA" : "FBM"}
          </button>
          <span className="text-xs text-slate-500">Tap to switch FBA/FBM</span>
          {sellerType === "FBM" ? (
            <label className="ml-auto text-sm font-medium text-slate-700">
              Shipping Cost (per unit)
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
                className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
              />
            </label>
          ) : null}
        </div>
      </section>

      {detailProduct && !selectedProduct ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">General Profit</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClasses(detailProduct.decision)}`}>
              {decisionDisplayLabel(detailProduct.decision)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {detailProduct.imageUrl ? (
              <img
                src={detailProduct.imageUrl}
                alt={detailProduct.title || "Product"}
                referrerPolicy="no-referrer"
                className="h-16 w-16 shrink-0 rounded border border-slate-200 object-contain"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{detailProduct.title || detailProduct.asin || "Product"}</p>
              {detailProduct.asin ? (
                <p className="text-xs text-slate-500">
                  ASIN: {detailProduct.asin}
                  {marketplaceDomain ? (
                    <>
                      {" · "}
                      <a
                        href={`https://www.${marketplaceDomain}/dp/${detailProduct.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 hover:underline"
                      >
                        View on Amazon
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Unit Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={wholesalePrice}
                onChange={(event) => setWholesalePrice(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                placeholder="e.g. 7.25"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Unit Quantity
              <input
                type="text"
                inputMode="decimal"
                value={projectedMonthlyUnits}
                onChange={(event) => setProjectedMonthlyUnits(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                placeholder="e.g. 30 or 1/2"
              />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <button
                type="button"
                onClick={() => void runManualAnalysis(sellerType, false)}
                disabled={isManualLoading}
                className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isManualLoading ? "Calculating..." : "Calculate Profit"}
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Net Profit</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(detailProduct.netProfit)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">ROI</p>
              <p className="text-lg font-semibold text-slate-900">{formatPercent(detailProduct.roiPercent)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Buy Box</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(detailProduct.buyBoxPrice)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Total Fees</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(detailProduct.totalFees)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Total Buy Cost ({projectedMonthlyUnits})</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(totalBuyCost)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Projected Profit (Qty)</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(projectedProfitForQuantity)}</p>
            </div>
          </div>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">AI Hint: </span>
            {buildAiInsight(detailProduct)}
          </p>
        </section>
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
          }`}
        >
          <p className="text-sm text-slate-700">{file ? file.name : "Drag and drop .xlsx/.xls/.csv here"}</p>
          <p className="mt-1 text-xs text-slate-500">or</p>
          <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Select File
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />
          </label>
        </div>

        <button
          type="submit"
          disabled={isUploadLoading}
          className="mt-5 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploadLoading ? "Analyzing File..." : "Run Batch Analysis"}
        </button>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</span>
          <span className="text-slate-700">
            Total: <span className="font-semibold text-slate-900">{results.length}</span>
          </span>
          <span className="text-emerald-700">
            Buy: <span className="font-semibold">{stats.profitable}</span>
          </span>
          <span className="text-amber-700">
            Ungate: <span className="font-semibold">{stats.ungating}</span>
          </span>
          <span className="text-rose-700">
            Skip (bad / low / no margin): <span className="font-semibold">{stats.bad}</span>
          </span>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

      {infoMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {infoMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">
              View
            <select
              value={viewFilter}
              onChange={(event) => setViewFilter(event.target.value as ViewFilter)}
              className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none ring-sky-400 focus:ring"
            >
              <option value="all">All products</option>
              <option value="buy_now">Buy now (profitable)</option>
              <option value="ungate_profitable">Ungate (profitable but gated)</option>
              <option value="restricted">Restricted / Approval required</option>
              <option value="needs_review">Needs review (undecided)</option>
            </select>
          </label>
            {results.length > 0 && lastRunMode === "upload" ? (
              <button
                type="button"
                onClick={() => void handleSellerTypeChange(sellerType === "FBA" ? "FBM" : "FBA")}
                disabled={isUploadLoading}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {sellerType} → Switch to {sellerType === "FBA" ? "FBM" : "FBA"}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-600">
            Showing {filteredSortedResults.length} of {results.length} products · Click a row for details
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header.key} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort(header.key)}
                      className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900"
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
              {filteredSortedResults.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                    {results.length === 0
                      ? "No results yet. Run a manual lookup or upload a file."
                      : "No products match the selected view filter."}
                  </td>
                </tr>
              ) : (
                filteredSortedResults.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelectedProduct(item);
                      setPopupQuantity("");
                    }}
                    className={`cursor-pointer border-t border-slate-200 transition hover:bg-slate-50 ${rowColorClasses(item.rowColor)} ${selectedProduct?.id === item.id ? "ring-2 ring-inset ring-sky-400" : ""}`}
                  >
                    <td className="px-3 py-2">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title || "Product"}
                          title={item.title || undefined}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 rounded border border-slate-200 object-contain"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[9px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-[240px]">
                        <p className="truncate font-medium text-slate-900" title={item.title || undefined}>
                          {item.title || item.asin || item.inputIdentifier || "-"}
                        </p>
                        <p className="text-xs text-slate-500">{item.asin ?? item.inputIdentifier}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2">{formatNumber(item.salesRank)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${decisionBadgeClasses(item.decision)}`}>
                        {decisionDisplayLabel(item.decision)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                  className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  Restart Scanner
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>

      {selectedProduct ? (
        <aside className="fixed inset-0 z-50 overflow-y-auto bg-white shadow-xl lg:inset-auto lg:right-0 lg:top-0 lg:h-screen lg:w-80 lg:rounded-l-xl lg:border lg:border-r-0 lg:border-slate-200 xl:w-96">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <h3 className="text-base font-semibold text-slate-900">Details</h3>
            <button
              type="button"
              onClick={() => {
                setSelectedProduct(null);
                setPopupQuantity("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.title || "Product"}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 shrink-0 rounded border border-slate-200 object-contain"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{selectedProduct.title || selectedProduct.asin || "Product"}</p>
                {selectedProduct.asin ? (
                  <p className="text-xs text-slate-500">
                    ASIN: {selectedProduct.asin}
                    {marketplaceDomain ? (
                      <>
                        {" · "}
                        <a
                          href={`https://www.${marketplaceDomain}/dp/${selectedProduct.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:underline"
                        >
                          View on Amazon
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClasses(selectedProduct.decision)}`}>
                {decisionDisplayLabel(selectedProduct.decision)}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Buy Box</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(selectedProduct.buyBoxPrice)}</p>
                </div>
                {!(lastRunMode === "manual" && results.length === 1) ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">Wholesale</p>
                    <p className="font-semibold text-slate-900">{formatCurrency(selectedProduct.wholesalePrice)}</p>
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Net Profit</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(selectedProduct.netProfit)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">ROI</p>
                  <p className="font-semibold text-slate-900">{formatPercent(selectedProduct.roiPercent)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">Fees (tax / referral / FBA)</p>
                <p className="font-semibold text-slate-900">{formatCurrency(selectedProduct.totalFees)}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Ref {formatCurrency(selectedProduct.referralFee)}
                  {selectedProduct.sellerType === "FBA" ? ` · FBA ${formatCurrency(selectedProduct.fbaFee)}` : ` · Ship ${formatCurrency(selectedProduct.shippingCost)}`}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Total Buy Cost ({projectedMonthlyUnits} units)</p>
                  <p className="font-semibold text-slate-900">
                    {(() => {
                      const qty = parsePositiveInput(projectedMonthlyUnits);
                      return qty !== null ? formatCurrency(roundToTwo(selectedProduct.wholesalePrice * qty)) : "—";
                    })()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Projected profit ({projectedMonthlyUnits} × net profit)</p>
                  <p className="font-semibold text-slate-900">
                    {(() => {
                      const qty = parsePositiveInput(projectedMonthlyUnits);
                      return selectedProduct.netProfit != null && qty !== null
                        ? formatCurrency(roundToTwo(selectedProduct.netProfit * qty))
                        : "—";
                    })()}
                  </p>
                </div>
              </div>

              {selectedProduct.salesRank != null ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">BSR (Best Seller Rank)</p>
                  <p className="font-semibold text-slate-900">{formatNumber(selectedProduct.salesRank)}</p>
                </div>
              ) : null}

              {selectedProduct.amazonIsSeller !== null ? (
                <p className="text-xs text-slate-600">
                  Amazon is seller: {selectedProduct.amazonIsSeller ? "Yes" : "No"}
                </p>
              ) : null}

              {(() => {
                const codes = selectedProduct.restrictionReasonCodes;
                const hasHazmat = codes.some((c) => /HAZMAT|HAZARD|DANGEROUS/i.test(c));
                const hasVariation = codes.some((c) => /VARIATION|VAR\b|PARENT_CHILD/i.test(c));
                return (
                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">IP / complaint risk</p>
                      <p className="text-sm font-medium text-slate-900">{selectedProduct.ipComplaintRisk ? "Yes" : "No"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Hazmat</p>
                      <p className="text-sm font-medium text-slate-900">{hasHazmat ? "Yes" : "No"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">Variation</p>
                      <p className="text-sm font-medium text-slate-900">{hasVariation ? "Yes" : "No"}</p>
                    </div>
                  </div>
                );
              })()}

            {selectedProduct.reasons.length > 0 || selectedProduct.restrictionReasonCodes.length > 0 || selectedProduct.error ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-900">Alerts / Amazon info</p>
                {selectedProduct.error ? (
                  <p className="mt-1 text-sm text-rose-700">{selectedProduct.error}</p>
                ) : null}
                {selectedProduct.listingRestricted ? <p className="mt-1 text-xs text-amber-800">Listing restricted</p> : null}
                {selectedProduct.approvalRequired ? <p className="mt-1 text-xs text-amber-800">Approval required</p> : null}
                {selectedProduct.restrictionReasonCodes.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-800">Codes: {selectedProduct.restrictionReasonCodes.join(", ")}</p>
                ) : null}
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                  {selectedProduct.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">AI: </span>
              {buildAiInsight(selectedProduct)}
            </p>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
