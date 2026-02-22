export type Decision = "BUY" | "WORTH UNGATING" | "BAD" | "LOW_MARGIN" | "UNKNOWN";
export type RowColor = "green" | "yellow" | "red";
export type SellerType = "FBA" | "FBM";

export interface ProductInput {
  identifier: string;
  productName?: string;
  wholesalePrice: number;
  brand?: string;
  projectedMonthlyUnits?: number;
  sellerType?: SellerType;
  shippingCost?: number;
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
  title: string;
  brand: string;
  sellerType: SellerType;
  wholesalePrice: number;
  shippingCost: number;
  buyBoxPrice: number | null;
  salesRank: number | null;
  amazonIsSeller: boolean | null;
  listingRestricted: boolean | null;
  approvalRequired: boolean | null;
  ipComplaintRisk: boolean | null;
  restrictionReasonCodes: string[];
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
  productName?: string;
  wholesalePrice: number;
  brand: string;
}
