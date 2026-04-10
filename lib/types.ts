export type Decision = "BUY" | "WORTH UNGATING" | "BAD" | "LOW_MARGIN" | "NO_MARGIN" | "UNKNOWN";
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

/** Per-offer seller info from Get Item Offers (feedback when API returns it). */
export interface SellerOfferDetail {
  sellerId: string;
  channel: "FBA" | "FBM";
  feedbackCount: number | null;
  feedbackPercent: number | null;
  /** Store / display name when SP-API includes it on the offer; often absent. */
  sellerDisplayName?: string | null;
}

export interface ProductAnalysis {
  id: string;
  inputIdentifier: string;
  asin: string | null;
  title: string;
  imageUrl: string | null;
  brand: string;
  sellerType: SellerType;
  wholesalePrice: number;
  shippingCost: number;
  buyBoxPrice: number | null;
  salesRank: number | null;
  /** Main category for BSR (e.g. "Beauty & Personal Care") when from PA-API; null if from SP-API only. */
  salesRankCategory: string | null;
  /** Estimated monthly unit sales derived from BSR (and category when available). */
  estimatedMonthlySales: number | null;
  /** Sales volume label from product page (e.g. "1K+", "500+") when extractable; null otherwise. */
  amazonSalesVolumeLabel: string | null;
  /** Number of offers (sellers) on the listing; null when not available. */
  offerCount: number | null;
  /** Number of FBA offers; null when not available. */
  fbaOfferCount: number | null;
  /** Number of FBM offers; null when not available. */
  fbmOfferCount: number | null;
  /** Seller IDs from Get Item Offers when returned by the API; empty if not available. */
  sellerIds: string[];
  /** Per-offer seller details (ID, channel, feedback count, feedback %) when from Get Item Offers. */
  sellerDetails: SellerOfferDetail[];
  listingRestricted: boolean | null;
  approvalRequired: boolean | null;
  ipComplaintRisk: boolean | null;
  /** Meltable (heat-sensitive) product. */
  meltableRisk: boolean | null;
  /** Likely private label / brand-gated. */
  privateLabelRisk: boolean | null;
  restrictionReasonCodes: string[];
  /**
   * From Catalog Items API `relationships` (VARIATION parent/child). Independent of listing restriction codes.
   * null = not loaded (legacy); true = catalog reports a variation family; false = no VARIATION links in catalog data.
   */
  hasCatalogVariationFamily?: boolean | null;
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
  /** Short label for this listing when from "all offers" (e.g. "New · FBA · $12.99", "Single", "3-Pack"). */
  offerLabel?: string | null;
}

export interface ParsedUploadRow {
  identifier: string;
  productName?: string;
  wholesalePrice: number;
  brand: string;
}
