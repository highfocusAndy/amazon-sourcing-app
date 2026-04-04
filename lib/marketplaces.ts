/** Amazon SP-API marketplace IDs for North America (used in Settings dropdown). */
export const MARKETPLACE_IDS = {
  USA: "ATVPDKIKX0DER",
  Canada: "A2EUQ1WTGCTBG2",
  Mexico: "A1AM78C64UM0Y8",
} as const;

export type MarketplaceId = (typeof MARKETPLACE_IDS)[keyof typeof MARKETPLACE_IDS];

export const MARKETPLACE_OPTIONS: { value: string; label: string }[] = [
  { value: MARKETPLACE_IDS.USA, label: "USA" },
  { value: MARKETPLACE_IDS.Canada, label: "Canada" },
  { value: MARKETPLACE_IDS.Mexico, label: "Mexico" },
];

export function isAllowedMarketplaceId(id: string | null | undefined): id is MarketplaceId {
  return id != null && Object.values(MARKETPLACE_IDS).includes(id as MarketplaceId);
}

/** Normalize a product identifier for retail links: trim, uppercase, strip non-alphanumeric. No length cap — Amazon resolves `/dp/{id}`. */
export function normalizeRetailAsin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Amazon retail URL to browse this seller’s product catalog (search scoped to their merchant ID).
 * Prefer this over `/sp?seller=` — that path is the seller profile (feedback, policies), not their listings.
 *
 * @param marketplaceDomain Host segment only, e.g. `amazon.com`, `amazon.co.uk` (no `https://`).
 */
export function amazonSellerStorefrontUrl(marketplaceDomain: string, sellerId: string): string {
  const host = marketplaceDomain.replace(/^www\./i, "").trim() || "amazon.com";
  const id = sellerId.trim();
  return `https://www.${host}/s?me=${encodeURIComponent(id)}`;
}

/**
 * URL intended for “see other sellers / offers” on Amazon.
 * Legacy `/gp/offer-listing/{ASIN}/` often loads a blank page (especially on mobile); Amazon now surfaces
 * offers via the product detail page (All-Offers Display / “Buying options”). We open the canonical PDP.
 */
export function amazonOfferListingUrl(marketplaceDomain: string, asin: string): string {
  return amazonProductDetailUrl(marketplaceDomain, asin);
}

/** Standard product detail (PDP) URL — most reliable across devices and marketplaces. */
export function amazonProductDetailUrl(marketplaceDomain: string, asin: string): string {
  const host = marketplaceDomain.replace(/^www\./i, "").trim() || "amazon.com";
  const id = normalizeRetailAsin(asin);
  return `https://www.${host}/dp/${encodeURIComponent(id)}`;
}
