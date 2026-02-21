import * as XLSX from "xlsx";

import type { ParsedUploadRow } from "@/lib/types";

interface DetectedColumns {
  identifierKey: string;
  costKey: string;
  brandKey?: string;
  casePackKey?: string;
}

interface ParsedFileResult {
  rows: ParsedUploadRow[];
  rowCount: number;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const sanitized = value.trim().replace(/[$,%\s,]/g, "");
    if (!sanitized) {
      return null;
    }
    const parsed = Number(sanitized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeIdentifier(value: unknown): string {
  const normalized = String(value ?? "").trim().replace(/\u200b/g, "");
  if (!normalized) {
    return "";
  }

  // Spreadsheet tools often coerce UPC/EAN to numeric with trailing .0.
  if (/^\d+\.0+$/.test(normalized)) {
    return normalized.slice(0, normalized.indexOf("."));
  }

  return normalized;
}

function findByPriority(
  headers: Array<{ original: string; normalized: string }>,
  priorityMatchers: string[][],
): string | undefined {
  for (const matcherGroup of priorityMatchers) {
    for (const header of headers) {
      if (matcherGroup.some((matcher) => header.normalized.includes(matcher))) {
        return header.original;
      }
    }
  }
  return undefined;
}

export function detectColumns(headers: string[]): DetectedColumns {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const identifierKey = findByPriority(normalizedHeaders, [
    ["asin"],
    ["upc"],
    ["ean"],
    ["barcode"],
    ["product_id", "productid"],
    ["item_id", "itemid"],
  ]);

  if (!identifierKey) {
    throw new Error("No identifier column found. Expected ASIN, UPC, EAN, barcode, product_id, or item_id.");
  }

  const costKey = findByPriority(normalizedHeaders, [
    ["unit_cost", "unitcost"],
    ["price_per_unit", "priceperunit"],
    ["buy_price", "buyprice"],
    ["wholesale"],
    ["case_cost", "casecost"],
    ["cost"],
  ]);

  if (!costKey) {
    throw new Error("No cost column found. Expected cost, wholesale, unit_cost, buy_price, case_cost, or price_per_unit.");
  }

  const brandKey = findByPriority(normalizedHeaders, [["brand"], ["manufacturer"], ["vendor"], ["supplier"]]);
  const casePackKey = findByPriority(normalizedHeaders, [["case_pack", "casepack"]]);

  return { identifierKey, costKey, brandKey, casePackKey };
}

export function parseSourcingFile(fileBuffer: Buffer): ParsedFileResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Upload contains no worksheet data.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (rawRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  const headers = Object.keys(rawRows[0]);
  const detected = detectColumns(headers);
  const normalizedCostKey = normalizeHeader(detected.costKey);
  const shouldUseCasePackPricing =
    Boolean(detected.casePackKey) && (normalizedCostKey.includes("case_cost") || normalizedCostKey.includes("casecost"));

  const rows: ParsedUploadRow[] = [];
  for (const rawRow of rawRows) {
    const identifier = normalizeIdentifier(rawRow[detected.identifierKey]);
    if (!identifier) {
      continue;
    }

    let wholesalePrice = parseNumber(rawRow[detected.costKey]);
    if (wholesalePrice === null) {
      continue;
    }

    if (shouldUseCasePackPricing && detected.casePackKey) {
      const casePack = parseNumber(rawRow[detected.casePackKey]);
      if (casePack === null || casePack <= 0) {
        continue;
      }
      wholesalePrice = wholesalePrice / casePack;
    }

    rows.push({
      identifier,
      wholesalePrice,
      brand: detected.brandKey ? String(rawRow[detected.brandKey] ?? "").trim() : "",
    });
  }

  return {
    rows,
    rowCount: rawRows.length,
  };
}
