"use client";

import { useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";

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

  const sortedResults = useMemo(() => {
    return [...results].sort((left, right) => compareValues(left, right, sortColumn, sortDirection));
  }, [results, sortColumn, sortDirection]);

  const stats = useMemo(() => {
    const profitable = results.filter((item) => item.decision === "BUY").length;
    const ungating = results.filter((item) => item.decision === "WORTH UNGATING").length;
    const bad = results.filter((item) => item.decision === "BAD" || item.decision === "LOW_MARGIN").length;
    return { profitable, ungating, bad };
  }, [results]);

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

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
          identifier,
          wholesalePrice: Number(wholesalePrice),
          brand,
          projectedMonthlyUnits: Number(projectedMonthlyUnits),
          sellerType,
          shippingCost: sellerType === "FBM" ? Number(shippingCost) : 0,
        }),
      });

      const json = (await response.json()) as { error?: string; result?: ProductAnalysis };
      if (!response.ok || !json.result) {
        throw new Error(json.error ?? "Manual analysis failed.");
      }

      setResults((current) => [json.result as ProductAnalysis, ...current]);
      setInfoMessage("Manual lookup complete.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Manual lookup failed.");
    } finally {
      setIsManualLoading(false);
    }
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
      formData.append("sellerType", sellerType);
      formData.append("shippingCost", sellerType === "FBM" ? shippingCost : "0");

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
      setInfoMessage(`Analyzed ${json.analyzedRows ?? json.results.length} rows from ${json.parsedRows ?? 0} uploaded rows.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload analysis failed.");
    } finally {
      setIsUploadLoading(false);
    }
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

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total analyzed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{results.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Green (Profitable)</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{stats.profitable}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Yellow (Ungating)</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{stats.ungating}</p>
          <p className="mt-1 text-xs text-slate-500">Red (Bad/Low Margin): {stats.bad}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Fulfillment Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose seller type once and apply it to manual and batch analyses.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Seller Type
            <select
              value={sellerType}
              onChange={(event) => setSellerType(event.target.value === "FBM" ? "FBM" : "FBA")}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
            >
              <option value="FBA">FBA</option>
              <option value="FBM">FBM</option>
            </select>
          </label>
          {sellerType === "FBM" ? (
            <label className="text-sm font-medium text-slate-700">
              Shipping Cost (per unit)
              <input
                type="number"
                min="0"
                step="0.01"
                value={shippingCost}
                onChange={(event) => setShippingCost(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              FBA mode uses Amazon fee preview (referral + fulfillment fees).
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleManualSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Manual Single Lookup</h2>
          <p className="mt-1 text-sm text-slate-600">Search one ASIN/UPC and calculate profit/ROI immediately.</p>

          <div className="mt-4 grid gap-3">
            <label className="text-sm font-medium text-slate-700">
              ASIN or UPC/EAN
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="B000123456 or 012345678901"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Wholesale Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={wholesalePrice}
                onChange={(event) => setWholesalePrice(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
                required
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Brand (optional)
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                placeholder="Nike"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
              />
            </label>

            <label className="text-sm font-medium text-slate-700">
              Projected Monthly Units
              <input
                type="number"
                min="1"
                step="1"
                value={projectedMonthlyUnits}
                onChange={(event) => setProjectedMonthlyUnits(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-400 focus:ring"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isManualLoading}
            className="mt-5 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isManualLoading ? "Running..." : "Analyze Product"}
          </button>
        </form>

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
                <th className="px-3 py-3">Ungating</th>
                <th className="px-3 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-8 text-center text-sm text-slate-500">
                    No results yet. Run a manual lookup or upload a file.
                  </td>
                </tr>
              ) : (
                sortedResults.map((item) => (
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
                      <div className="text-xs text-slate-600">{item.amazonIsSeller ? "Amazon seller: Yes" : "Amazon seller: No"}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold">{item.decision}</td>
                    <td className="px-3 py-3 text-xs text-slate-700">
                      {item.restrictedBrand ? (
                        <>
                          <div>10-unit cost: {formatCurrency(item.ungatingCost10Units)}</div>
                          <div>Break-even units: {formatNumber(item.breakEvenUnits)}</div>
                          <div>Monthly profit: {formatCurrency(item.projectedMonthlyProfit)}</div>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700">
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
    </main>
  );
}
