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

type HeaderMeta = {
  original: string;
  normalized: string;
};

const IDENTIFIER_PRIORITY: string[][] = [
  ["asin"],
  ["upc"],
  ["ean"],
  ["barcode"],
  ["product_id", "productid"],
  ["item_id", "itemid"],
  ["gtin"],
];

const COST_PRIORITY: string[][] = [
  ["unit_cost", "unitcost"],
  ["price_per_unit", "priceperunit"],
  ["buy_price", "buyprice"],
  ["wholesale"],
  ["case_cost", "casecost"],
  ["cost"],
];

const BRAND_PRIORITY: string[][] = [["brand"], ["manufacturer"], ["vendor"], ["supplier"]];
const CASE_PACK_PRIORITY: string[][] = [["case_pack", "casepack"]];

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

function toHeaderMeta(headers: string[]): HeaderMeta[] {
  return headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));
}

function findKeysByPriority(headers: HeaderMeta[], priorityMatchers: string[][]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const matcherGroup of priorityMatchers) {
    for (const header of headers) {
      if (!seen.has(header.original) && matcherGroup.some((matcher) => header.normalized.includes(matcher))) {
        ordered.push(header.original);
        seen.add(header.original);
      }
    }
  }

  return ordered;
}

function ensurePrimaryFirst(primary: string, keys: string[]): string[] {
  const deduped = [primary, ...keys.filter((key) => key !== primary)];
  return [...new Set(deduped)];
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

function detectHeaderRow(sheetRows: unknown[][]): number {
  const scanLimit = Math.min(sheetRows.length, 30);
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < scanLimit; index += 1) {
    const row = sheetRows[index] ?? [];
    const normalizedCells = row
      .map((cell) => normalizeHeader(String(cell ?? "")))
      .filter((cell) => cell.length > 0);

    if (normalizedCells.length === 0) {
      continue;
    }

    let score = 0;

    if (normalizedCells.some((cell) => IDENTIFIER_PRIORITY.some((group) => group.some((token) => cell.includes(token))))) {
      score += 4;
    }

    if (normalizedCells.some((cell) => COST_PRIORITY.some((group) => group.some((token) => cell.includes(token))))) {
      score += 4;
    }

    if (normalizedCells.some((cell) => BRAND_PRIORITY.some((group) => group.some((token) => cell.includes(token))))) {
      score += 1;
    }

    if (normalizedCells.some((cell) => CASE_PACK_PRIORITY.some((group) => group.some((token) => cell.includes(token))))) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildHeaders(headerRow: unknown[]): string[] {
  const headers: string[] = [];
  const counts = new Map<string, number>();

  for (let index = 0; index < headerRow.length; index += 1) {
    const raw = String(headerRow[index] ?? "").trim();
    const base = raw || `column_${index + 1}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    headers.push(seen === 0 ? base : `${base}_${seen + 1}`);
  }

  return headers;
}

function toObjectRows(headers: string[], rawDataRows: unknown[][]): Array<Record<string, unknown>> {
  const objectRows: Array<Record<string, unknown>> = [];

  for (const rawRow of rawDataRows) {
    const row: Record<string, unknown> = {};
    for (let index = 0; index < headers.length; index += 1) {
      row[headers[index]] = rawRow[index] ?? "";
    }
    objectRows.push(row);
  }

  return objectRows;
}

function getFirstIdentifierValue(row: Record<string, unknown>, identifierKeys: string[]): string {
  for (const key of identifierKeys) {
    const identifier = normalizeIdentifier(row[key]);
    if (identifier) {
      return identifier;
    }
  }
  return "";
}

function isCaseCostKey(header: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized.includes("case_cost") || normalized.includes("casecost");
}

function resolveUnitCost(
  row: Record<string, unknown>,
  costKeys: string[],
  casePackKey?: string,
): number | null {
  for (const costKey of costKeys) {
    const parsedCost = parseNumber(row[costKey]);
    if (parsedCost === null) {
      continue;
    }

    if (casePackKey && isCaseCostKey(costKey)) {
      const casePack = parseNumber(row[casePackKey]);
      if (casePack === null || casePack <= 0) {
        continue;
      }
      return parsedCost / casePack;
    }

    return parsedCost;
  }

  return null;
}

export function detectColumns(headers: string[]): DetectedColumns {
  const normalizedHeaders = toHeaderMeta(headers);
  const identifierKey = findKeysByPriority(normalizedHeaders, IDENTIFIER_PRIORITY)[0];

  if (!identifierKey) {
    throw new Error("No identifier column found. Expected ASIN, UPC, EAN, barcode, product_id, or item_id.");
  }

  const costKey = findKeysByPriority(normalizedHeaders, COST_PRIORITY)[0];

  if (!costKey) {
    throw new Error("No cost column found. Expected cost, wholesale, unit_cost, buy_price, case_cost, or price_per_unit.");
  }

  const brandKey = findKeysByPriority(normalizedHeaders, BRAND_PRIORITY)[0];
  const casePackKey = findKeysByPriority(normalizedHeaders, CASE_PACK_PRIORITY)[0];

  return { identifierKey, costKey, brandKey, casePackKey };
}

export function parseSourcingFile(fileBuffer: Buffer): ParsedFileResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Upload contains no worksheet data.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (sheetRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  const headerRowIndex = detectHeaderRow(sheetRows);
  const headers = buildHeaders(sheetRows[headerRowIndex] ?? []);
  const rawRows = toObjectRows(headers, sheetRows.slice(headerRowIndex + 1));

  if (rawRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  const detected = detectColumns(headers);
  const headerMeta = toHeaderMeta(headers);
  const identifierKeys = ensurePrimaryFirst(
    detected.identifierKey,
    findKeysByPriority(headerMeta, IDENTIFIER_PRIORITY),
  );
  const costKeys = ensurePrimaryFirst(detected.costKey, findKeysByPriority(headerMeta, COST_PRIORITY));

  const rows: ParsedUploadRow[] = [];
  for (const rawRow of rawRows) {
    const identifier = getFirstIdentifierValue(rawRow, identifierKeys);
    if (!identifier) {
      continue;
    }

    const wholesalePrice = resolveUnitCost(rawRow, costKeys, detected.casePackKey);
    if (wholesalePrice === null) {
      continue;
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
