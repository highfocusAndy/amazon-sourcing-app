import * as XLSX from "xlsx";

import type { ParsedUploadRow } from "@/lib/types";

interface DetectedColumns {
  identifierKey?: string;
  productNameKey?: string;
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
const PRODUCT_NAME_PRIORITY: string[][] = [
  ["product_name", "productname"],
  ["item_name", "itemname"],
  ["title"],
  ["description", "desc"],
  ["name"],
];
const ASIN_VALUE_REGEX = /^[A-Z0-9]{10}$/i;
const UPC_EAN_VALUE_REGEX = /^\d{8,14}$/;

type ColumnStats = {
  nonEmpty: number;
  asinLike: number;
  upcLike: number;
  alphaLike: number;
  numeric: number;
  decimalNumeric: number;
  smallInteger: number;
  numericSum: number;
};

type SheetParseResult = {
  rows: ParsedUploadRow[];
  rowCount: number;
};

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

function toPlainIntegerString(value: number): string {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) {
    return "";
  }
  return rounded.toLocaleString("fullwide", { useGrouping: false });
}

function toHeaderMeta(headers: string[]): HeaderMeta[] {
  return headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));
}

function matchesAnyToken(normalizedHeader: string, groups: string[][]): boolean {
  return groups.some((group) => group.some((token) => normalizedHeader.includes(token)));
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

function pickProductNameKey(headers: HeaderMeta[], excludedKeys: Set<string>): string | undefined {
  const candidates = findKeysByPriority(headers, PRODUCT_NAME_PRIORITY);
  for (const candidate of candidates) {
    if (excludedKeys.has(candidate)) {
      continue;
    }

    const normalized = headers.find((header) => header.original === candidate)?.normalized ?? "";
    if (!normalized) {
      continue;
    }

    if (
      matchesAnyToken(normalized, IDENTIFIER_PRIORITY) ||
      matchesAnyToken(normalized, COST_PRIORITY) ||
      matchesAnyToken(normalized, BRAND_PRIORITY) ||
      matchesAnyToken(normalized, CASE_PACK_PRIORITY)
    ) {
      continue;
    }

    return candidate;
  }

  return undefined;
}

function normalizeIdentifier(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return toPlainIntegerString(value);
    }
    return String(value);
  }

  const normalized = String(value ?? "").trim().replace(/\u200b/g, "");
  if (!normalized) {
    return "";
  }

  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(normalized)) {
    const scientific = Number(normalized);
    if (Number.isFinite(scientific)) {
      return toPlainIntegerString(scientific);
    }
  }

  // Spreadsheet tools often coerce UPC/EAN to numeric with trailing .0.
  if (/^\d+\.0+$/.test(normalized)) {
    return normalized.slice(0, normalized.indexOf("."));
  }

  return normalized;
}

function looksLikeResolvableIdentifier(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  if (ASIN_VALUE_REGEX.test(normalized)) {
    return true;
  }

  const digits = normalized.replace(/\D/g, "");
  return UPC_EAN_VALUE_REGEX.test(digits);
}

function detectHeaderRow(sheetRows: unknown[][]): number {
  const scanLimit = Math.min(sheetRows.length, 30);
  let bestIndex = 0;
  let bestScore = -1;
  let bestWidth = -1;

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

    if (normalizedCells.some((cell) => PRODUCT_NAME_PRIORITY.some((group) => group.some((token) => cell.includes(token))))) {
      score += 1;
    }

    if (score > bestScore || (score === bestScore && normalizedCells.length > bestWidth)) {
      bestScore = score;
      bestIndex = index;
      bestWidth = normalizedCells.length;
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

function isRowEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
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

function rate(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return part / whole;
}

function inferColumnsFromValues(headers: string[], rawRows: Array<Record<string, unknown>>): DetectedColumns {
  const sampleRows = rawRows.slice(0, 400);
  const stats = new Map<string, ColumnStats>();
  for (const header of headers) {
    stats.set(header, {
      nonEmpty: 0,
      asinLike: 0,
      upcLike: 0,
      alphaLike: 0,
      numeric: 0,
      decimalNumeric: 0,
      smallInteger: 0,
      numericSum: 0,
    });
  }

  for (const row of sampleRows) {
    for (const header of headers) {
      const headerStats = stats.get(header);
      if (!headerStats) {
        continue;
      }

      const normalized = normalizeIdentifier(row[header]);
      if (!normalized) {
        continue;
      }

      headerStats.nonEmpty += 1;
      const compact = normalized.replace(/\s+/g, "").toUpperCase();
      if (ASIN_VALUE_REGEX.test(compact)) {
        headerStats.asinLike += 1;
      }

      if (/[A-Z]/.test(compact)) {
        headerStats.alphaLike += 1;
      }

      const digits = compact.replace(/\D/g, "");
      if (UPC_EAN_VALUE_REGEX.test(digits)) {
        headerStats.upcLike += 1;
      }

      const numeric = parseNumber(row[header]);
      if (numeric !== null) {
        headerStats.numeric += 1;
        headerStats.numericSum += Math.abs(numeric);
        if (!Number.isInteger(numeric)) {
          headerStats.decimalNumeric += 1;
        }
        if (Number.isInteger(numeric) && numeric >= 2 && numeric <= 500) {
          headerStats.smallInteger += 1;
        }
      }
    }
  }

  const headerMeta = toHeaderMeta(headers);
  const headerBrandKey = findKeysByPriority(headerMeta, BRAND_PRIORITY)[0];
  const headerCasePackKey = findKeysByPriority(headerMeta, CASE_PACK_PRIORITY)[0];

  const asinRanked = headers
    .map((header) => {
      const s = stats.get(header)!;
      return {
        header,
        ratio: rate(s.asinLike, s.nonEmpty),
        count: s.asinLike,
      };
    })
    .sort((a, b) => b.ratio - a.ratio || b.count - a.count);

  const upcRanked = headers
    .map((header) => {
      const s = stats.get(header)!;
      return {
        header,
        ratio: rate(s.upcLike, s.nonEmpty),
        count: s.upcLike,
      };
    })
    .sort((a, b) => b.ratio - a.ratio || b.count - a.count);

  const asinCandidate = asinRanked[0];
  const upcCandidate = upcRanked[0];

  let identifierKey: string | undefined;
  if (asinCandidate && asinCandidate.ratio >= 0.15 && asinCandidate.count >= 3) {
    identifierKey = asinCandidate.header;
  } else if (upcCandidate && upcCandidate.ratio >= 0.15 && upcCandidate.count >= 3) {
    identifierKey = upcCandidate.header;
  } else if (asinCandidate && asinCandidate.ratio > 0.05) {
    identifierKey = asinCandidate.header;
  } else if (upcCandidate && upcCandidate.ratio > 0.05) {
    identifierKey = upcCandidate.header;
  }

  let headerProductNameKey = pickProductNameKey(headerMeta, new Set([headerBrandKey, headerCasePackKey].filter(Boolean) as string[]));
  const identifierExists = Boolean(identifierKey);
  if (!identifierExists && !headerProductNameKey) {
    throw new Error("No identifier or product name column found. Expected ASIN/UPC/EAN/barcode or product title/name.");
  }

  let casePackKey = headerCasePackKey;
  if (!casePackKey) {
    const inferredCasePack = headers
      .filter((header) => header !== identifierKey)
      .map((header) => {
        const s = stats.get(header)!;
        const numericCount = Math.max(s.numeric, 1);
        const smallIntegerRatio = rate(s.smallInteger, numericCount);
        const average = s.numericSum / numericCount;
        return {
          header,
          smallIntegerRatio,
          average,
          numericCount: s.numeric,
        };
      })
      .filter((entry) => entry.numericCount >= 4 && entry.smallIntegerRatio > 0.8 && entry.average >= 2 && entry.average <= 200)
      .sort((a, b) => b.smallIntegerRatio - a.smallIntegerRatio);

    casePackKey = inferredCasePack[0]?.header;
  }

  const costCandidate = headers
    .filter((header) => header !== identifierKey && header !== headerProductNameKey)
    .map((header) => {
      const s = stats.get(header)!;
      const numericRate = rate(s.numeric, s.nonEmpty);
      const decimalRate = rate(s.decimalNumeric, Math.max(s.numeric, 1));
      const smallIntegerRate = rate(s.smallInteger, Math.max(s.numeric, 1));
      const average = s.numericSum / Math.max(s.numeric, 1);
      let score = numericRate * 4 + decimalRate + Math.min(average / 100, 0.75) - smallIntegerRate * 1.5;
      if (casePackKey && header === casePackKey) {
        score -= 2;
      }

      return {
        header,
        numericRate,
        score,
      };
    })
    .filter((entry) => entry.numericRate >= 0.35)
    .sort((a, b) => b.score - a.score);

  const costKey = costCandidate[0]?.header;
  if (!costKey) {
    throw new Error("No cost column found. Expected cost, wholesale, unit_cost, buy_price, case_cost, or price_per_unit.");
  }

  if (!headerProductNameKey) {
    const inferredNameCandidate = headers
      .filter((header) => header !== identifierKey && header !== costKey && header !== casePackKey && header !== headerBrandKey)
      .map((header) => {
        const s = stats.get(header)!;
        const nonEmpty = Math.max(s.nonEmpty, 1);
        const alphaRatio = rate(s.alphaLike, nonEmpty);
        const numericRatio = rate(s.numeric, nonEmpty);
        return {
          header,
          alphaRatio,
          numericRatio,
          nonEmpty: s.nonEmpty,
        };
      })
      .filter((entry) => entry.nonEmpty >= 3 && entry.alphaRatio >= 0.5 && entry.numericRatio <= 0.5)
      .sort((a, b) => b.alphaRatio - a.alphaRatio || b.nonEmpty - a.nonEmpty);

    headerProductNameKey = inferredNameCandidate[0]?.header;
  }

  return {
    identifierKey,
    productNameKey: headerProductNameKey,
    costKey,
    brandKey: headerBrandKey,
    casePackKey,
  };
}

export function detectColumns(headers: string[]): DetectedColumns {
  const normalizedHeaders = toHeaderMeta(headers);
  const identifierKey = findKeysByPriority(normalizedHeaders, IDENTIFIER_PRIORITY)[0];

  const costKey = findKeysByPriority(normalizedHeaders, COST_PRIORITY)[0];

  if (!costKey) {
    throw new Error("No cost column found. Expected cost, wholesale, unit_cost, buy_price, case_cost, or price_per_unit.");
  }

  const brandKey = findKeysByPriority(normalizedHeaders, BRAND_PRIORITY)[0];
  const casePackKey = findKeysByPriority(normalizedHeaders, CASE_PACK_PRIORITY)[0];
  const productNameKey = pickProductNameKey(
    normalizedHeaders,
    new Set([identifierKey, costKey, brandKey, casePackKey].filter(Boolean) as string[]),
  );

  if (!identifierKey && !productNameKey) {
    throw new Error("No identifier or product name column found. Expected ASIN/UPC/EAN/barcode or product title/name.");
  }

  return { identifierKey, productNameKey, costKey, brandKey, casePackKey };
}

function parseSheetData(sheet: XLSX.WorkSheet): SheetParseResult {
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  if (sheetRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  const headerRowIndex = detectHeaderRow(sheetRows);
  const headers = buildHeaders(sheetRows[headerRowIndex] ?? []);
  const rawRows = toObjectRows(headers, sheetRows.slice(headerRowIndex + 1)).filter((row) => !isRowEmpty(row));

  if (rawRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  let detected: DetectedColumns;
  try {
    detected = detectColumns(headers);
  } catch {
    detected = inferColumnsFromValues(headers, rawRows);
  }

  const headerMeta = toHeaderMeta(headers);
  const identifierKeys = detected.identifierKey
    ? ensurePrimaryFirst(detected.identifierKey, findKeysByPriority(headerMeta, IDENTIFIER_PRIORITY))
    : [];
  const costKeys = ensurePrimaryFirst(detected.costKey, findKeysByPriority(headerMeta, COST_PRIORITY));

  const rows: ParsedUploadRow[] = [];
  for (const rawRow of rawRows) {
    let identifier = identifierKeys.length > 0 ? getFirstIdentifierValue(rawRow, identifierKeys) : "";
    let productName = detected.productNameKey ? String(rawRow[detected.productNameKey] ?? "").trim() : "";

    // If a candidate identifier is actually a product title, switch to keyword-based lookup.
    if (identifier && !looksLikeResolvableIdentifier(identifier) && !productName) {
      productName = identifier;
      identifier = "";
    }

    if (!identifier && !productName) {
      continue;
    }

    const wholesalePrice = resolveUnitCost(rawRow, costKeys, detected.casePackKey);
    if (wholesalePrice === null) {
      continue;
    }

    rows.push({
      identifier,
      productName,
      wholesalePrice,
      brand: detected.brandKey ? String(rawRow[detected.brandKey] ?? "").trim() : "",
    });
  }

  return {
    rows,
    rowCount: rawRows.length,
  };
}

export function parseSourcingFile(fileBuffer: Buffer): ParsedFileResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  if (workbook.SheetNames.length === 0) {
    throw new Error("Upload contains no worksheet data.");
  }

  let bestResult: ParsedFileResult | null = null;
  let lastColumnError: Error | null = null;
  let lastUnexpectedError: Error | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    try {
      const parsed = parseSheetData(sheet);
      if (
        !bestResult ||
        parsed.rows.length > bestResult.rows.length ||
        (parsed.rows.length === bestResult.rows.length && parsed.rowCount > bestResult.rowCount)
      ) {
        bestResult = parsed;
      }
    } catch (error) {
      if (error instanceof Error && /No identifier column|No cost column/.test(error.message)) {
        lastColumnError = error;
      } else if (error instanceof Error) {
        lastUnexpectedError = error;
      }
    }
  }

  if (bestResult && (bestResult.rows.length > 0 || bestResult.rowCount > 0)) {
    return bestResult;
  }

  if (lastColumnError) {
    throw lastColumnError;
  }

  if (lastUnexpectedError) {
    throw lastUnexpectedError;
  }

  return {
    rows: [],
    rowCount: 0,
  };
}
