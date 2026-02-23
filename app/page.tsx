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

function rowColorClasses(color: ProductAnalysis["rowColor"]): string {
  if (color === "green") {
    return "bg-emerald-50";
  }
  if (color === "yellow") {
    return "bg-amber-50";
  }
  return "bg-rose-50";
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
  if (decision === "BAD") {
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
    return item.amazonIsSeller === true
      ? "Profitable but Amazon is on listing. Watch buy box share and price volatility."
      : "Strong candidate. Profit and ROI are acceptable with current market snapshot.";
  }

  if (item.decision === "WORTH UNGATING") {
    return "Potentially attractive after ungating. Confirm docs and post-ungating margin stability.";
  }

  if (item.decision === "LOW_MARGIN") {
    return "Margin is thin. Negotiate lower cost, reduce shipping, or skip.";
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
  const [projectedMonthlyUnits, setProjectedMonthlyUnits] = useState("30");
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
          wholesalePrice: lookupOnly ? 0 : Number(wholesalePrice),
          brand,
          projectedMonthlyUnits: lookupOnly ? 1 : Number(projectedMonthlyUnits),
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
          setResults([]);
          setLastRunMode("manual");
          setInfoMessage(
            isScannerTriggered
              ? `Scanned ${effectiveIdentifier}. Product found. Continue with cost and units.`
              : "Product found. Continue with cost and units.",
          );
          return;
        }

        setManualIdentifierResolved(true);

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
    if (!manualIdentifierResolved) {
      lastAutoManualCalcKeyRef.current = "";
      return;
    }

    if (isManualLoading || isUploadLoading || isScannerOpen || !identifier.trim()) {
      return;
    }

    const parsedWholesalePrice = Number(wholesalePrice);
    const parsedProjectedUnits = Number(projectedMonthlyUnits);
    if (
      Number.isNaN(parsedWholesalePrice) ||
      Number.isNaN(parsedProjectedUnits) ||
      parsedWholesalePrice <= 0 ||
      parsedProjectedUnits <= 0
    ) {
      return;
    }

    const autoCalcKey = [
      identifier.trim().toUpperCase(),
      sellerType,
      shippingCost,
      wholesalePrice,
      projectedMonthlyUnits,
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
    const bad = results.filter((item) => item.decision === "BAD" || item.decision === "LOW_MARGIN").length;
    return { profitable, ungating, bad };
  }, [results]);

  const manualResult = lastRunMode === "manual" && results.length > 0 ? results[0] : null;

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
    setInfoMessage(null);
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

    if (isManualLoading || isUploadLoading || results.length === 0) {
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
    { key: "inputIdentifier", label: "Input" },
    { key: "asin", label: "ASIN" },
    { key: "brand", label: "Brand" },
    { key: "sellerType", label: "Seller" },
    { key: "buyBoxPrice", label: "Buy Box" },
    { key: "wholesalePrice", label: "Wholesale" },
    { key: "shippingCost", label: "Shipping" },
    { key: "totalFees", label: "Fees" },
    { key: "netProfit", label: "Net Profit" },
    { key: "roiPercent", label: "ROI%" },
    { key: "salesRank", label: "BSR" },
    { key: "decision", label: "Decision" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-6">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Amazon FBA/FBM Wholesale Sourcing Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Upload wholesale catalogs or search a single ASIN/UPC, then evaluate Buy Box pricing, fees, ROI, and ungating opportunity.
        </p>
      </header>

      <form onSubmit={handleManualSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Manual Single Lookup</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {manualIdentifierResolved ? "Step 2: Cost + Units" : "Step 1: Product Lookup"}
          </span>
        </div>
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

          {manualIdentifierResolved ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="text-xs uppercase tracking-wide text-slate-500">Brand (auto)</p>
                <p className="mt-1 font-semibold">{brand || "-"}</p>
              </div>
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
                  required
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Unit Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={projectedMonthlyUnits}
                  onChange={(event) => setProjectedMonthlyUnits(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                  placeholder="e.g. 30"
                  required
                />
              </label>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Complete product lookup to continue.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isManualLoading}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isManualLoading
              ? manualIdentifierResolved
                ? "Calculating..."
                : "Loading Product..."
              : manualIdentifierResolved
                ? "Calculate Profit"
                : "Get Product Data"}
          </button>
          {manualIdentifierResolved ? (
            <p className="text-xs text-slate-600">
              Profit calculation runs automatically when Unit Price or Unit Quantity changes.
            </p>
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

      {manualResult ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">General Profit</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadgeClasses(manualResult.decision)}`}>
              {manualResult.decision}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Net Profit</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(manualResult.netProfit)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">ROI</p>
              <p className="text-lg font-semibold text-slate-900">{formatPercent(manualResult.roiPercent)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Buy Box</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(manualResult.buyBoxPrice)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Total Fees</p>
              <p className="text-lg font-semibold text-slate-900">{formatCurrency(manualResult.totalFees)}</p>
            </div>
          </div>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">AI Hint: </span>
            {buildAiInsight(manualResult)}
          </p>
        </section>
      ) : null}

      <form onSubmit={handleUploadSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload Wholesale File</h2>
        <p className="mt-1 text-sm text-slate-600">
          Include product identifier (ASIN/UPC/EAN/barcode) or product name/title, plus wholesale cost.
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
            Bad/Low Margin: <span className="font-semibold">{stats.bad}</span>
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
          <p className="text-xs text-slate-600">
            Showing {filteredSortedResults.length} of {results.length} products
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
                <th className="px-3 py-3">AI / Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredSortedResults.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-sm text-slate-500">
                    {results.length === 0
                      ? "No results yet. Run a manual lookup or upload a file."
                      : "No products match the selected view filter."}
                  </td>
                </tr>
              ) : (
                filteredSortedResults.map((item) => (
                  <tr key={item.id} className={`${rowColorClasses(item.rowColor)} border-t border-slate-200 align-top`}>
                    <td className="px-3 py-3">{item.inputIdentifier}</td>
                    <td className="px-3 py-3">{item.asin ?? "-"}</td>
                    <td className="px-3 py-3">{item.brand || "-"}</td>
                    <td className="px-3 py-3">{item.sellerType}</td>
                    <td className="px-3 py-3">{formatCurrency(item.buyBoxPrice)}</td>
                    <td className="px-3 py-3">{formatCurrency(item.wholesalePrice)}</td>
                    <td className="px-3 py-3">{item.sellerType === "FBM" ? formatCurrency(item.shippingCost) : "-"}</td>
                    <td className="px-3 py-3">
                      <div>Total: {formatCurrency(item.totalFees)}</div>
                      <div className="text-xs text-slate-600">
                        Ref {formatCurrency(item.referralFee)} /{" "}
                        {item.sellerType === "FBA"
                          ? `FBA ${formatCurrency(item.fbaFee)}`
                          : `Ship ${formatCurrency(item.shippingCost)}`}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold">{formatCurrency(item.netProfit)}</td>
                    <td className="px-3 py-3">{formatPercent(item.roiPercent)}</td>
                    <td className="px-3 py-3">
                      <div>{formatNumber(item.salesRank)}</div>
                      <div className="text-xs text-slate-600">
                        {item.amazonIsSeller === true
                          ? "Amazon seller: Yes"
                          : item.amazonIsSeller === false
                            ? "Amazon seller: No"
                            : "Amazon seller: Unknown"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decisionBadgeClasses(item.decision)}`}>
                        {item.decision}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700">
                      <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-700">
                        <span className="font-semibold text-slate-900">AI:</span> {buildAiInsight(item)}
                      </div>
                      {item.restrictedBrand ? (
                        <div className="mb-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
                          <div>10-unit cost: {formatCurrency(item.ungatingCost10Units)}</div>
                          <div>Break-even units: {formatNumber(item.breakEvenUnits)}</div>
                          <div>Monthly profit: {formatCurrency(item.projectedMonthlyProfit)}</div>
                        </div>
                      ) : null}
                      {item.error ? <div className="mb-1 text-rose-700">{item.error}</div> : null}
                      {item.reasons.length > 0 ? (
                        <ul className="list-disc space-y-1 pl-4">
                          {item.reasons.map((reason) => (
                            <li key={`${item.id}-${reason}`}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        "-"
                      )}
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
  );
}
