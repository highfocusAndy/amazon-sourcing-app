export type Decision = "BUY" | "WORTH UNGATING" | "BAD" | "LOW_MARGIN" | "UNKNOWN";
export type RowColor = "green" | "yellow" | "red";

export interface ProductInput {
  identifier: string;
  wholesalePrice: number;
  brand?: string;
  projectedMonthlyUnits?: number;
}

export interface FeePreview {
  referralFee: number;
  fbaFee: number;
  totalFees: number;
}

export interface ProductAnalysis {
  id: string;
  inputIdentifier: string;
  asin: string | null;
  brand: string;
  wholesalePrice: number;
  buyBoxPrice: number | null;
  salesRank: number | null;
  amazonIsSeller: boolean;
  referralFee: number;
  fbaFee: number;
  totalFees: number;
  netProfit: number | null;
  roiPercent: number | null;
  restrictedBrand: boolean;
  ungatingCost10Units: number | null;
  breakEvenUnits: number | null;
  projectedMonthlyProfit: number | null;
  worthUngating: boolean;
  decision: Decision;
  rowColor: RowColor;
  reasons: string[];
  error?: string;
  createdAt: string;
}

export interface ParsedUploadRow {
  identifier: string;
  wholesalePrice: number;
  brand: string;
}
