import * as XLSX from "xlsx";

import type { ParsedUploadRow } from "@/lib/types";

interface ParsedFileResult {
  rows: ParsedUploadRow[];
  rowCount: number;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parsePrice(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function resolveColumn(headers: string[], aliases: string[]): string | null {
  const normalizedMap = new Map<string, string>();
  for (const header of headers) {
    normalizedMap.set(normalizeHeader(header), header);
  }

  for (const alias of aliases) {
    const exact = normalizedMap.get(normalizeHeader(alias));
    if (exact) {
      return exact;
    }
  }

  for (const [normalized, original] of normalizedMap.entries()) {
    if (aliases.some((alias) => normalized.includes(normalizeHeader(alias)))) {
      return original;
    }
  }

  return null;
}

export function parseSourcingFile(fileBuffer: Buffer): ParsedFileResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Upload contains no worksheet data.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rawRows.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  const headers = Object.keys(rawRows[0]);
  const identifierColumn = resolveColumn(headers, ["UPC/EAN", "UPC", "EAN", "GTIN"]);
  const wholesaleColumn = resolveColumn(headers, ["Wholesale Price", "Wholesale", "Cost"]);
  const brandColumn = resolveColumn(headers, ["Brand"]);

  if (!identifierColumn || !wholesaleColumn || !brandColumn) {
    throw new Error(
      'Missing required columns. Expected headers similar to: "UPC/EAN", "Wholesale Price", and "Brand".',
    );
  }

  const rows: ParsedUploadRow[] = [];
  for (const rawRow of rawRows) {
    const identifier = String(rawRow[identifierColumn] ?? "").trim();
    if (!identifier) {
      continue;
    }

    rows.push({
      identifier,
      wholesalePrice: parsePrice(rawRow[wholesaleColumn]),
      brand: String(rawRow[brandColumn] ?? "").trim(),
    });
  }

  return {
    rows,
    rowCount: rawRows.length,
  };
}
