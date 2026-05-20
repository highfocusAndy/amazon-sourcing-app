/**
 * Optional PA-API 5.0 (Product Advertising API) client.
 * Used exclusively to fetch WebsiteSalesRank — the "main-category BSR" that matches
 * what Amazon shows on the product page. SP-API only returns sub-category ranks.
 *
 * Requires PA_API_ACCESS_KEY (LWA client ID), PA_API_SECRET_KEY (LWA client secret),
 * and PA_API_PARTNER_TAG in env. Authenticates via OAuth 2.0 client credentials (LWA).
 * When not configured or if the request fails, callers fall back to the SP-API catalog rank.
 */

const PA_API_GET_ITEMS_TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";
const PA_API_SEARCH_TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";
const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

/** In-process token cache — avoids fetching a new token on every PA-API call (tokens last 1 hour). */
let _tokenCache: { token: string; expiresAt: number } | null = null;

const MARKETPLACE_TO_PA_HOST_REGION: Record<string, { host: string; region: string }> = {
  ATVPDKIKX0DER: { host: "webservices.amazon.com", region: "us-east-1" },
  A2EUQ1WTGCTBG2: { host: "webservices.amazon.ca", region: "us-east-1" },
  A1AM78C64UM0Y8: { host: "webservices.amazon.com.mx", region: "us-east-1" },
  A2Q3Y263D00KWC: { host: "webservices.amazon.com.br", region: "us-east-1" },
  A1F83G8C2RGOOP: { host: "webservices.amazon.co.uk", region: "eu-west-1" },
  A13V1IB3VIYZZH: { host: "webservices.amazon.fr", region: "eu-west-1" },
  A1PA6795UKMFR9: { host: "webservices.amazon.de", region: "eu-west-1" },
  APJ6JRA9NG5V4: { host: "webservices.amazon.it", region: "eu-west-1" },
  A1RKKUPIHCS9HS: { host: "webservices.amazon.es", region: "eu-west-1" },
  A1805IZSGTT6HS: { host: "webservices.amazon.nl", region: "eu-west-1" },
  A1C3ZFZOHQY46M: { host: "webservices.amazon.pl", region: "eu-west-1" },
  A17E79C6D8DWNP: { host: "webservices.amazon.sa", region: "eu-west-1" },
  A21TJRUUN4KGV: { host: "webservices.amazon.in", region: "eu-west-1" },
  A33AVAJ2PDY3EV: { host: "webservices.amazon.tr", region: "eu-west-1" },
  A2VIGQ35RCS4UG: { host: "webservices.amazon.ae", region: "eu-west-1" },
  A21T2K0T0K0K0K: { host: "webservices.amazon.se", region: "eu-west-1" },
  A1VC38T7YXB528: { host: "webservices.amazon.co.jp", region: "us-west-2" },
  A19VAU5U5O7RUS: { host: "webservices.amazon.sg", region: "us-west-2" },
  A39IBJ37TRP1C6: { host: "webservices.amazon.com.au", region: "us-west-2" },
};

export interface PaApiMainBsrResult {
  salesRank: number;
  categoryName: string | null;
  /** Affiliate-tagged Amazon product URL when DetailPageURL resource was requested; null otherwise. */
  affiliateUrl: string | null;
}

/** Public catalog data for a known ASIN — returned from PA-API so no SP-API seller quota used. */
export interface PaApiCatalogItem {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  /** Current lowest price (Buy Box / listing price) if available. */
  price: number | null;
  salesRank: number | null;
  salesRankCategory: string | null;
  /** Affiliate-tagged Amazon product URL (DetailPageURL); null when not returned. */
  affiliateUrl: string | null;
}

/** Lightweight result set from a PA-API keyword search. */
export interface PaApiSearchResult {
  items: PaApiCatalogItem[];
}

export type PaApiCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Explorer category label → PA-API SearchIndex (US marketplace). */
const CATEGORY_TO_PA_SEARCH_INDEX: Record<string, string> = {
  Appliances: "Appliances",
  "Apps & Games": "MobileApps",
  "Arts, Crafts & Sewing": "ArtsAndCrafts",
  Automotive: "Automotive",
  Baby: "Baby",
  "Beauty & Personal Care": "Beauty",
  Books: "Books",
  "Camera & Photo": "Electronics",
  "CDs & Vinyl": "Music",
  "Cell Phones & Accessories": "Wireless",
  "Clothing, Shoes & Jewelry": "Fashion",
  "Collectibles & Fine Art": "Collectibles",
  "Computers & Accessories": "Computers",
  Electronics: "Electronics",
  "Grocery & Gourmet Food": "Grocery",
  "Handmade Products": "Handmade",
  "Health & Household": "HealthPersonalCare",
  "Home & Kitchen": "HomeGarden",
  "Industrial & Scientific": "Industrial",
  "Kindle Store": "KindleStore",
  "Luggage & Travel Gear": "Luggage",
  "Movies & TV": "MoviesAndTV",
  "Musical Instruments": "MusicalInstruments",
  "Office Products": "OfficeProducts",
  "Patio, Lawn & Garden": "Lawngarden",
  "Pet Supplies": "PetSupplies",
  Software: "Software",
  "Sports & Outdoors": "SportingGoods",
  "Tools & Home Improvement": "Tools",
  "Toys & Games": "ToysAndGames",
  "Video Games": "VideoGames",
  Watches: "Watches",
};

function looksLikeLwaClientId(key: string): boolean {
  // Accept amzn1.application-oa2-client.* OAuth client IDs and plain keys of sufficient length.
  return key.trim().length >= 10;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isPaApiConfigured(): boolean {
  const key = process.env.PA_API_ACCESS_KEY?.trim();
  const secret = process.env.PA_API_SECRET_KEY?.trim();
  const tag = process.env.PA_API_PARTNER_TAG?.trim();
  return Boolean(key && secret && tag && looksLikeLwaClientId(key));
}

/** Human-readable reason PA-API env vars are present but unusable. */
export function getPaApiConfigurationIssue(): string | null {
  const key = process.env.PA_API_ACCESS_KEY?.trim();
  const secret = process.env.PA_API_SECRET_KEY?.trim();
  const tag = process.env.PA_API_PARTNER_TAG?.trim();
  if (!key || !secret || !tag) return null;
  if (!looksLikeLwaClientId(key)) {
    return "PA_API_ACCESS_KEY is missing or too short — expected an LWA client ID (amzn1.application-oa2-client.*).";
  }
  return null;
}

/** Fetch (or return cached) an LWA OAuth access token using client credentials. */
async function fetchLwaAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(LWA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`LWA token endpoint returned invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof json.error_description === "string"
      ? json.error_description
      : typeof json.error === "string"
      ? json.error
      : `LWA token request failed (${res.status})`;
    throw new Error(msg);
  }
  const token = typeof json.access_token === "string" ? json.access_token : "";
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  if (!token) throw new Error("LWA token response missing access_token");
  _tokenCache = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

export function resolvePaApiSearchParams(options: {
  category?: string | null;
  subcategory?: string | null;
  keyword?: string | null;
  fallbackQuery?: string;
}): { keywords: string; searchIndex: string } {
  const keywordParts: string[] = [];
  if (options.subcategory && options.subcategory !== "All") keywordParts.push(options.subcategory);
  if (options.keyword?.trim()) keywordParts.push(options.keyword.trim());

  const searchIndex =
    options.category && CATEGORY_TO_PA_SEARCH_INDEX[options.category]
      ? CATEGORY_TO_PA_SEARCH_INDEX[options.category]
      : "All";

  if (keywordParts.length > 0) {
    return { keywords: keywordParts.join(" "), searchIndex };
  }

  if (options.category) {
    return { keywords: options.category, searchIndex };
  }

  return {
    keywords: options.fallbackQuery?.trim() || "best seller",
    searchIndex: "All",
  };
}

function getPaApiConfig(): {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  host: string;
  region: string;
} {
  const accessKey = process.env.PA_API_ACCESS_KEY?.trim();
  const secretKey = process.env.PA_API_SECRET_KEY?.trim();
  const partnerTag = process.env.PA_API_PARTNER_TAG?.trim();
  if (!accessKey || !secretKey || !partnerTag) {
    throw new Error("PA-API credentials missing: set PA_API_ACCESS_KEY, PA_API_SECRET_KEY, PA_API_PARTNER_TAG");
  }
  const marketplaceId = (process.env.MARKETPLACE_ID ?? process.env.SP_API_MARKETPLACE_ID ?? "ATVPDKIKX0DER").trim().toUpperCase();
  const { host, region } = MARKETPLACE_TO_PA_HOST_REGION[marketplaceId] ?? {
    host: "webservices.amazon.com",
    region: "us-east-1",
  };
  return { accessKey, secretKey, partnerTag, host, region };
}

function parseGetItemsResponse(json: unknown): PaApiMainBsrResult | null {
  const root = asObject(json);
  const itemsResult = asObject(root?.ItemsResult);
  const items = Array.isArray(itemsResult?.Items) ? itemsResult.Items : [];
  const first = asObject(items[0]);
  if (!first) return null;

  const browseNodeInfo = asObject(first.BrowseNodeInfo);
  if (!browseNodeInfo) return null;

  const websiteSalesRank = asObject(browseNodeInfo.WebsiteSalesRank);
  if (!websiteSalesRank) return null;

  const rank = readNumber(websiteSalesRank.SalesRank);
  if (rank === null || rank < 1) return null;

  const displayName = readString(websiteSalesRank.DisplayName) ?? readString(websiteSalesRank.ContextFreeName);
  const affiliateUrl = readString(first.DetailPageURL);
  return {
    salesRank: rank,
    categoryName: displayName,
    affiliateUrl,
  };
}

/** Resources needed to populate PaApiCatalogItem. */
const CATALOG_ITEM_RESOURCES = [
  "ItemInfo.Title",
  "ItemInfo.ByLineInfo",
  "Images.Primary.Medium",
  "Offers.Listings.Price",
  "BrowseNodeInfo.WebsiteSalesRank",
  "DetailPageURL",
];

function parseCatalogItems(json: unknown): PaApiCatalogItem[] {
  const root = asObject(json);
  const itemsResult = asObject(root?.ItemsResult);
  const rawItems = Array.isArray(itemsResult?.Items) ? itemsResult.Items : [];
  const results: PaApiCatalogItem[] = [];

  for (const raw of rawItems) {
    const item = asObject(raw);
    if (!item) continue;
    const asin = readString(item.ASIN);
    if (!asin) continue;

    const itemInfo = asObject(item.ItemInfo);
    const titleObj = asObject(itemInfo?.Title);
    const title = readString(titleObj?.DisplayValue) ?? "";

    const byLineInfo = asObject(itemInfo?.ByLineInfo);
    const brandArr = Array.isArray(byLineInfo?.Brand) ? byLineInfo.Brand : [];
    const brandObj = asObject(brandArr[0] ?? byLineInfo?.Brand);
    const brand = readString(brandObj?.DisplayValue) ?? "";

    const imagesObj = asObject(item.Images);
    const primaryObj = asObject(imagesObj?.Primary);
    const mediumObj = asObject(primaryObj?.Medium);
    const imageUrl = readString(mediumObj?.URL);

    const offersObj = asObject(item.Offers);
    const listings = Array.isArray(offersObj?.Listings) ? offersObj.Listings : [];
    let price: number | null = null;
    for (const listing of listings) {
      const l = asObject(listing);
      const priceObj = asObject(l?.Price);
      const amount = readNumber(priceObj?.Amount);
      if (amount !== null && amount > 0) {
        price = amount;
        break;
      }
    }

    const browseNodeInfo = asObject(item.BrowseNodeInfo);
    const websiteSalesRank = asObject(browseNodeInfo?.WebsiteSalesRank);
    const salesRank = readNumber(websiteSalesRank?.SalesRank);
    const salesRankCategory =
      readString(websiteSalesRank?.DisplayName) ?? readString(websiteSalesRank?.ContextFreeName);

    const affiliateUrl = readString(item.DetailPageURL);
    results.push({ asin, title, brand, imageUrl, price, salesRank, salesRankCategory, affiliateUrl });
  }
  return results;
}

async function paApiPost(
  target: string,
  body: Record<string, unknown>,
): Promise<PaApiCallResult<unknown>> {
  if (!isPaApiConfigured()) {
    return { ok: false, error: "PA-API is not configured." };
  }
  const configIssue = getPaApiConfigurationIssue();
  if (configIssue) {
    return { ok: false, error: configIssue };
  }
  const { accessKey, secretKey, partnerTag, host } = getPaApiConfig();

  let accessToken: string;
  try {
    accessToken = await fetchLwaAccessToken(accessKey, secretKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to obtain LWA access token.";
    console.error("PA-API OAuth token error:", message);
    return { ok: false, error: message };
  }

  const bodyStr = JSON.stringify({ ...body, PartnerTag: partnerTag, PartnerType: "Associates" });
  const response = await fetch(`https://${host}/`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "amz-1.0",
      "x-amz-target": target,
    },
    body: bodyStr,
    cache: "no-store",
  });
  const raw = await response.text();
  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: "PA-API returned invalid JSON." };
  }
  if (!response.ok) {
    const root = asObject(json);
    const errors = Array.isArray(root?.Errors) ? root.Errors : [];
    const first = asObject(errors[0]);
    const message =
      readString(first?.Message) ??
      readString(root?.message) ??
      `PA-API request failed (${response.status}).`;
    console.error("PA-API HTTP error:", response.status, message);
    return { ok: false, error: message };
  }
  const root = asObject(json);
  const errors = Array.isArray(root?.Errors) ? root.Errors : [];
  if (errors.length > 0) {
    const first = asObject(errors[0]);
    const message = readString(first?.Message) ?? "PA-API returned an error.";
    console.error("PA-API error payload:", message);
    return { ok: false, error: message };
  }
  return { ok: true, data: json };
}

/**
 * Fetch the main product-page BSR (WebsiteSalesRank) and its category for an ASIN.
 * Returns null if PA-API is not configured, or the request fails, or the item has no WebsiteSalesRank.
 */
export async function fetchMainBsr(asin: string): Promise<PaApiMainBsrResult | null> {
  if (!isPaApiConfigured()) return null;
  const normalizedAsin = asin.trim().toUpperCase();
  if (!normalizedAsin || normalizedAsin.length !== 10) return null;
  const { host } = getPaApiConfig();
  const json = await paApiPost(PA_API_GET_ITEMS_TARGET, {
    ItemIds: [normalizedAsin],
    ItemIdType: "ASIN",
    Marketplace: host === "webservices.amazon.com" ? "www.amazon.com" : undefined,
    Resources: ["BrowseNodeInfo.WebsiteSalesRank", "BrowseNodeInfo.BrowseNodes.SalesRank", "DetailPageURL"],
  });
  if (!json.ok) return null;
  return parseGetItemsResponse(json.data);
}

/**
 * Fetch public catalog data (title, brand, image, price, BSR) for up to 10 ASINs via PA-API.
 * Uses no seller quota — safe to call for any signed-in user regardless of Connect Amazon status.
 * Returns null if PA-API is not configured.
 */
export async function fetchCatalogItemsFromPaApi(
  asins: string[],
): Promise<PaApiCallResult<PaApiCatalogItem[]>> {
  if (!isPaApiConfigured()) {
    return { ok: false, error: "PA-API is not configured." };
  }
  const normalizedAsins = asins
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a.length === 10)
    .slice(0, 10);
  if (normalizedAsins.length === 0) {
    return { ok: false, error: "No valid ASINs provided." };
  }
  const { host } = getPaApiConfig();
  const json = await paApiPost(PA_API_GET_ITEMS_TARGET, {
    ItemIds: normalizedAsins,
    ItemIdType: "ASIN",
    Marketplace: host === "webservices.amazon.com" ? "www.amazon.com" : undefined,
    Resources: CATALOG_ITEM_RESOURCES,
  });
  if (!json.ok) return json;
  return { ok: true, data: parseCatalogItems(json.data) };
}

/**
 * Search Amazon catalog by keyword via PA-API (no seller quota).
 * Returns lightweight results (ASIN, title, brand, image, price, BSR).
 * Returns null when PA-API is not configured.
 */
export async function searchCatalogByKeywordPaApi(
  keyword: string,
  maxResults = 10,
  searchIndex = "All",
): Promise<PaApiCallResult<PaApiSearchResult>> {
  if (!isPaApiConfigured()) {
    return { ok: false, error: "PA-API is not configured." };
  }
  const { host } = getPaApiConfig();
  const json = await paApiPost(PA_API_SEARCH_TARGET, {
    Keywords: keyword.trim().slice(0, 250),
    SearchIndex: searchIndex,
    ItemCount: Math.min(10, Math.max(1, maxResults)),
    Marketplace: host === "webservices.amazon.com" ? "www.amazon.com" : undefined,
    Resources: CATALOG_ITEM_RESOURCES,
  });
  if (!json.ok) return json;
  const root = asObject(json.data);
  const searchResult = asObject(root?.SearchResult);
  const rawItems = Array.isArray(searchResult?.Items) ? searchResult.Items : [];
  const fakeGetItems = { ItemsResult: { Items: rawItems } };
  return { ok: true, data: { items: parseCatalogItems(fakeGetItems) } };
}
