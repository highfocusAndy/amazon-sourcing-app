import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import aws4 from "aws4";

import { getCatalogItemCache, setCatalogItemCache } from "@/lib/spApiResponseCache";
import type { SellerType } from "@/lib/types";

type HttpMethod = "GET" | "POST";

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number;
}

interface SpApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  sellerId: string;
  marketplaceId: string;
  spApiHost: string;
  awsSessionToken?: string;
  awsRoleArn?: string;
  awsRoleSessionName: string;
}

/** Build SP-API config from env (used for per-user accounts: app credentials from env, rest from DB). */
export function buildSpApiConfigFromEnvAndAccount(account: {
  refreshToken: string;
  sellerId: string;
  marketplaceId: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  spApiHost: string | null;
  awsRoleArn?: string | null;
  awsRoleSessionName?: string | null;
}): SpApiConfig | null {
  const clientId = process.env.SP_API_CLIENT_ID?.trim();
  const clientSecret = process.env.SP_API_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  const awsRegion = account.awsRegion?.trim() || "us-east-1";
  const spApiHost = account.spApiHost?.trim() || defaultSpApiHost(awsRegion);
  return {
    clientId,
    clientSecret,
    refreshToken: account.refreshToken,
    awsAccessKeyId: account.awsAccessKeyId,
    awsSecretAccessKey: account.awsSecretAccessKey,
    awsRegion,
    sellerId: account.sellerId,
    marketplaceId: account.marketplaceId,
    spApiHost,
    awsSessionToken: process.env.AWS_SESSION_TOKEN?.trim(),
    awsRoleArn: account.awsRoleArn ?? undefined,
    awsRoleSessionName: account.awsRoleSessionName ?? "next-sp-api-session",
  };
}

interface LwaTokenCache {
  token: string;
  expiresAt: number;
}

/** Per-offer seller info from Get Item Offers (SellerId, channel, feedback when API returns it). */
export interface SellerOfferDetail {
  sellerId: string;
  channel: "FBA" | "FBM";
  feedbackCount: number | null;
  feedbackPercent: number | null;
  sellerDisplayName?: string | null;
}

export interface CatalogItem {
  asin: string;
  title: string;
  brand: string;
  rank: number | null;
  imageUrl: string | null;
  /** From `relationships` includedData: VARIATION links with parent and/or child ASINs. */
  hasVariationFamily?: boolean;
}

export interface CompetitivePricing {
  buyBoxPrice: number | null;
  /** Item price (without shipping) when available; used for fee API. */
  listingPrice: number | null;
  /** Shipping amount when available; used for fee API. */
  shippingAmount: number | null;
  /** Total number of offers (sellers) on the listing; null when not available (e.g. fallback API). */
  offerCount: number | null;
  /** Number of FBA offers; null when not available. */
  fbaOfferCount: number | null;
  /** Number of FBM (merchant-fulfilled) offers; null when not available. */
  fbmOfferCount: number | null;
  /** Seller IDs from Get Item Offers when returned by the API; empty if not available. */
  sellerIds: string[];
  /** Per-offer seller details (ID, channel, feedback) when from Get Item Offers; empty when fallback. */
  sellerDetails: SellerOfferDetail[];
}

/** Single offer (listing) from Get Item Offers for "all listings" view. */
export interface ItemOfferRow {
  listingPrice: number;
  shippingAmount: number;
  landedPrice: number;
  channel: "FBA" | "FBM";
  condition: string;
  sellerId: string | null;
  feedbackCount: number | null;
  feedbackPercent: number | null;
}

export interface FeeEstimate {
  referralFee: number;
  fulfillmentFee: number;
  totalFees: number;
}

export interface ListingRestrictionsAssessment {
  restricted: boolean;
  approvalRequired: boolean;
  ipComplaintRisk: boolean;
  /** Meltable product (heat-sensitive); separate from general hazmat. */
  meltableRisk: boolean;
  /** Likely private label / brand-gated (approval + brand/IP signals). */
  privateLabelRisk: boolean;
  reasonCodes: string[];
  reasonMessages: string[];
}

const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const UPC_EAN_REGEX = /^\d{8,14}$/;
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

const listingRestrictionsCache = new Map<string, ListingRestrictionsAssessment>();

let spApiClientSingleton: SpApiClient | null = null;

function defaultSpApiHost(awsRegion: string): string {
  if (awsRegion.startsWith("eu-")) {
    return "sellingpartnerapi-eu.amazon.com";
  }
  if (awsRegion.startsWith("ap-")) {
    return "sellingpartnerapi-fe.amazon.com";
  }
  return "sellingpartnerapi-na.amazon.com";
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env.local`);
  }
  return value;
}

function requiredEnvFromList(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing one of ${names.join(", ")} in .env.local`);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getField(source: Record<string, unknown> | null, candidates: string[]): unknown {
  if (!source) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (candidate in source) {
      return source[candidate];
    }
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** True when Catalog API returns a VARIATION relationship with at least one parent or child ASIN. */
function extractCatalogVariationFamilyFlag(itemObj: Record<string, unknown>): boolean {
  const relByMkt = asArray(getField(itemObj, ["relationships", "Relationships"]));
  for (const block of relByMkt) {
    const m = asObject(block);
    if (!m) continue;
    const rels = asArray(getField(m, ["relationships", "Relationships"]));
    for (const r of rels) {
      const rr = asObject(r);
      if (!rr) continue;
      const typeRaw =
        readString(getField(rr, ["type", "Type", "relationshipType", "RelationshipType"])) ?? "";
      const typeStr = typeRaw.toUpperCase();
      const childAsins = asArray(getField(rr, ["childAsins", "ChildAsins"]));
      const parentAsins = asArray(getField(rr, ["parentAsins", "ParentAsins"]));
      if (childAsins.length === 0 && parentAsins.length === 0) continue;
      // Prefer explicit VARIATION; if type is missing but Amazon sent parent/child ASINs, treat as variation family.
      if (!typeStr || typeStr.includes("VARIATION")) {
        return true;
      }
    }
  }
  return false;
}

function toCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().replace(/\u200b/g, "");
}

function extractAsinCandidate(value: string): string | null {
  const normalized = value.toUpperCase();
  if (ASIN_REGEX.test(normalized)) {
    return normalized;
  }

  const matches = normalized.match(/[A-Z0-9]{10}/g) ?? [];
  for (const match of matches) {
    const hasLetter = /[A-Z]/.test(match);
    const hasDigit = /\d/.test(match);
    if (hasLetter && hasDigit) {
      return match;
    }
  }

  return null;
}

function buildNumericIdentifierCandidates(rawDigits: string): string[] {
  const base = rawDigits.replace(/\D/g, "");
  const candidates = new Set<string>();

  if (base) {
    candidates.add(base);
    const trimmed = base.replace(/^0+/, "");
    if (trimmed) {
      candidates.add(trimmed);
    }
  }

  if (base.length >= 8 && base.length < 12) {
    candidates.add(base.padStart(12, "0"));
  }

  if (base.length >= 8 && base.length < 13) {
    candidates.add(base.padStart(13, "0"));
  }

  if (base.length >= 8 && base.length < 14) {
    candidates.add(base.padStart(14, "0"));
  }

  return [...candidates].filter((candidate) => UPC_EAN_REGEX.test(candidate));
}

function readSpApiConfig(marketplaceIdOverride?: string): SpApiConfig {
  const awsRegion = process.env.AWS_REGION?.trim() || "us-east-1";
  const marketplaceId =
    marketplaceIdOverride?.trim() ||
    requiredEnvFromList(["MARKETPLACE_ID", "SP_API_MARKETPLACE_ID"]);
  const sellerId = requiredEnv("SELLER_ID");

  return {
    clientId: requiredEnv("SP_API_CLIENT_ID"),
    clientSecret: requiredEnv("SP_API_CLIENT_SECRET"),
    refreshToken: requiredEnv("SP_API_REFRESH_TOKEN"),
    awsAccessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
    awsRegion,
    sellerId,
    marketplaceId,
    spApiHost: process.env.SP_API_HOST?.trim() || defaultSpApiHost(awsRegion),
    awsSessionToken: process.env.AWS_SESSION_TOKEN?.trim(),
    awsRoleArn: process.env.AWS_ROLE_ARN?.trim(),
    awsRoleSessionName: process.env.AWS_ROLE_SESSION_NAME?.trim() || "next-sp-api-session",
  };
}

/** Same as readSpApiConfig but returns null if any required env var is missing. */
export function tryReadSpApiConfig(marketplaceIdOverride?: string | null): SpApiConfig | null {
  try {
    return readSpApiConfig(marketplaceIdOverride ?? undefined);
  } catch {
    return null;
  }
}

export class SpApiClient {
  private lwaTokenCache: LwaTokenCache | null = null;
  private assumedRoleCache: AwsCredentials | null = null;

  constructor(private readonly config: SpApiConfig = readSpApiConfig()) {}

  get marketplaceId(): string {
    return this.config.marketplaceId;
  }

  get sellerId(): string {
    return this.config.sellerId;
  }

  private async getLwaAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.lwaTokenCache && this.lwaTokenCache.expiresAt - 60_000 > now) {
      return this.lwaTokenCache.token;
    }

    const payload = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload.toString(),
      cache: "no-store",
    });

    const raw = await response.text();
    let json: Record<string, unknown> = {};
    if (raw) {
      try {
        json = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        json = {};
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to get SP-API LWA token (${response.status})`);
    }

    const token = readString(json.access_token);
    if (!token) {
      throw new Error("SP-API LWA token response missing access_token");
    }

    const expiresIn = readNumber(json.expires_in) ?? 3600;
    this.lwaTokenCache = {
      token,
      expiresAt: now + expiresIn * 1000,
    };
    return token;
  }

  private async getAwsCredentials(): Promise<AwsCredentials> {
    if (!this.config.awsRoleArn) {
      return {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
        sessionToken: this.config.awsSessionToken,
      };
    }

    const now = Date.now();
    if (this.assumedRoleCache?.expiresAt && this.assumedRoleCache.expiresAt - 60_000 > now) {
      return this.assumedRoleCache;
    }

    const stsClient = new STSClient({
      region: this.config.awsRegion,
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
        sessionToken: this.config.awsSessionToken,
      },
    });

    const assumed = await stsClient.send(
      new AssumeRoleCommand({
        RoleArn: this.config.awsRoleArn,
        RoleSessionName: this.config.awsRoleSessionName,
        DurationSeconds: 3600,
      }),
    );

    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error("Failed to assume AWS role for SP-API credentials");
    }

    this.assumedRoleCache = {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiresAt: credentials.Expiration ? credentials.Expiration.getTime() : now + 3600 * 1000,
    };

    return this.assumedRoleCache;
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    options?: {
      query?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<T> {
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const [token, awsCredentials] = await Promise.all([this.getLwaAccessToken(), this.getAwsCredentials()]);
      const query = options?.query ? `?${new URLSearchParams(options.query).toString()}` : "";
      const body = options?.body ? JSON.stringify(options.body) : undefined;

      const signed = aws4.sign(
        {
          service: "execute-api",
          region: this.config.awsRegion,
          host: this.config.spApiHost,
          method,
          path: `${path}${query}`,
          headers: {
            host: this.config.spApiHost,
            "x-amz-access-token": token,
            "content-type": "application/json",
          },
          body,
        },
        {
          accessKeyId: awsCredentials.accessKeyId,
          secretAccessKey: awsCredentials.secretAccessKey,
          sessionToken: awsCredentials.sessionToken,
        },
      );

      const response = await fetch(`https://${this.config.spApiHost}${signed.path}`, {
        method,
        headers: signed.headers as Record<string, string>,
        body,
        cache: "no-store",
      });

      const raw = await response.text();
      let json: unknown = {};
      if (raw) {
        try {
          json = JSON.parse(raw);
        } catch {
          json = {};
        }
      }

      if (response.ok) {
        return json as T;
      }

      const isQuotaError = response.status === 429 || /QuotaExceeded|rate limit|throttl/i.test(raw);
      const userMessage = isQuotaError
        ? "Amazon API rate limit reached. Please wait a few minutes and try again. Amazon limits how many requests we can make per hour."
        : `SP-API request failed (${response.status}) on ${method} ${path}${raw ? `: ${raw.slice(0, 500)}` : ""}`;

      const responseError = new Error(userMessage);
      lastError = responseError;

      if (attempt < maxAttempts && RETRYABLE_HTTP_STATUS.has(response.status)) {
        // Exponential backoff for transient API throttling/service errors.
        await sleep(300 * 2 ** (attempt - 1));
        continue;
      }

      throw responseError;
    }

    throw lastError ?? new Error(`SP-API request failed on ${method} ${path}`);
  }

  /**
   * Store / seller display name from Sellers API marketplace participations.
   */
  async fetchSellerStoreDisplayName(preferredMarketplaceId?: string | null): Promise<string | null> {
    type ParticipationRow = {
      storeName?: string;
      marketplace?: { id?: string };
    };
    type MpResponse = { payload?: ParticipationRow[] };
    const data = await this.request<MpResponse>("GET", "/sellers/v1/marketplaceParticipations");
    const list = Array.isArray(data.payload) ? data.payload : [];
    const pref = preferredMarketplaceId?.trim();
    if (pref) {
      const row = list.find((p) => p.marketplace?.id === pref);
      const n = row?.storeName?.trim();
      if (n) return n;
    }
    for (const p of list) {
      const n = p.storeName?.trim();
      if (n) return n;
    }
    return null;
  }

  private extractCatalogItem(item: unknown): CatalogItem | null {
    const itemObj = asObject(item);
    if (!itemObj) {
      return null;
    }

    const directAsin = readString(itemObj.asin);
    const identifiers = asObject(itemObj.identifiers);
    const marketplaceAsin = asObject(identifiers?.marketplaceASIN);
    const asin = directAsin ?? readString(marketplaceAsin?.asin);
    if (!asin) {
      return null;
    }

    const summaries = asArray(itemObj.summaries);
    const summary = asObject(summaries[0]);
    const title =
      readString(summary?.itemName) ??
      readString(summary?.itemNameByMarketplace) ??
      readString(summary?.itemNameByLanguage) ??
      "";
    let brand = readString(getField(summary ?? null, ["brandName", "brand", "BrandName", "Brand", "manufacturer", "Manufacturer"])) ?? "";
    if (!brand && summaries.length > 1) {
      for (let i = 1; i < summaries.length; i++) {
        const s = asObject(summaries[i]);
        brand = readString(getField(s ?? null, ["brandName", "brand", "BrandName", "Brand", "manufacturer", "Manufacturer"])) ?? "";
        if (brand) break;
      }
    }

    const salesRanks = asArray(itemObj.salesRanks);
    const allRanks: number[] = [];
    for (const rankGroupRaw of salesRanks) {
      const rankGroup = asObject(rankGroupRaw);
      if (!rankGroup) {
        continue;
      }

      const groupedRanks = asArray(rankGroup.classificationRanks).concat(asArray(rankGroup.displayGroupRanks));
      for (const rankRaw of groupedRanks) {
        const rankObj = asObject(rankRaw);
        const parsedRank = readNumber(rankObj?.rank);
        if (parsedRank !== null && parsedRank >= 1) {
          allRanks.push(parsedRank);
        }
      }
    }
    // Use the highest (worst) rank to match Seller Central's main Sales Rank. SP-API returns multiple
    // ranks (e.g. #241 in a small subcategory, #22,860 in main category); Seller Central shows the main one.
    const rank: number | null = allRanks.length > 0 ? Math.max(...allRanks) : null;

    let imageUrl: string | null = null;
    const imagesByMkt = asArray(itemObj.images);
    const firstMktImages = asObject(imagesByMkt[0]);
    const imageList = asArray(firstMktImages?.images);
    for (const imgRaw of imageList) {
      const img = asObject(imgRaw);
      if (readString(img?.variant)?.toUpperCase() === "MAIN") {
        imageUrl = readString(img?.link);
        break;
      }
    }
    if (!imageUrl && imageList.length > 0) {
      const firstImg = asObject(imageList[0]);
      imageUrl = readString(firstImg?.link);
    }

    const hasVariationFamily = extractCatalogVariationFamilyFlag(itemObj);

    return { asin, title, brand, rank, imageUrl, hasVariationFamily };
  }

  private extractPricing(data: unknown): CompetitivePricing {
    const root = asObject(data);
    // Get Item Offers returns { payload: { Summary, Offers, ASIN } }; allow Summary/Offers at root too.
    let payload = asObject(getField(root, ["payload", "Payload"]));
    if (!payload || (!getField(payload, ["Summary", "summary"]) && !getField(payload, ["Offers", "offers"]))) {
      payload = root;
    }
    const summary = asObject(getField(payload, ["Summary", "summary"]));
    const offers = asArray(getField(payload, ["Offers", "offers"]));

    const buyBoxPrices = asArray(getField(summary, ["BuyBoxPrices", "buyBoxPrices"]));
    const buyBox = asObject(buyBoxPrices[0]);
    const buyBoxLandedPrice = asObject(getField(buyBox, ["LandedPrice", "landedPrice"]));
    const buyBoxListingPrice = asObject(getField(buyBox, ["ListingPrice", "listingPrice"]));
    const buyBoxShipping = asObject(getField(buyBox, ["Shipping", "shipping"]));

    let buyBoxPrice = readNumber(buyBoxLandedPrice?.Amount);
    let listingPrice: number | null = readNumber(buyBoxListingPrice?.Amount);
    let shippingAmount: number | null = readNumber(buyBoxShipping?.Amount) ?? 0;
    if (buyBoxPrice !== null && (listingPrice === null || listingPrice === undefined)) {
      listingPrice = buyBoxPrice;
      shippingAmount = 0;
    }
    if (buyBoxPrice === null) {
      const lowestPrices = asArray(getField(summary, ["LowestPrices", "lowestPrices"]));
      const lowest = asObject(lowestPrices[0]);
      const landed = asObject(getField(lowest, ["LandedPrice", "landedPrice"]));
      buyBoxPrice = readNumber(landed?.Amount);
    }

    // Prefer offer marked as Buy Box winner over lowest price, so displayed price matches Amazon.
    let buyBoxWinnerLanded: number | null = null;
    let buyBoxWinnerListing: number | null = null;
    let buyBoxWinnerShipping: number | null = null;
    let lowestLanded: number | null = null;
    let lowestListing: number | null = null;
    let lowestShipping: number | null = null;

    for (const offerRaw of offers) {
      const offer = asObject(offerRaw);
      const listingPriceObj = asObject(getField(offer, ["ListingPrice", "listingPrice"]));
      const shippingPriceObj = asObject(getField(offer, ["Shipping", "shipping"]));
      const listing = readNumber(listingPriceObj?.Amount);
      const shipping = readNumber(shippingPriceObj?.Amount) ?? 0;
      if (listing === null) continue;
      const landed = listing + shipping;
      const rawWinner = getField(offer, ["IsBuyBoxWinner", "isBuyBoxWinner"]);
      const isWinner = rawWinner === true || (typeof rawWinner === "string" && rawWinner.trim().toLowerCase() === "true");
      if (isWinner && (buyBoxWinnerLanded === null || landed < buyBoxWinnerLanded)) {
        buyBoxWinnerLanded = landed;
        buyBoxWinnerListing = listing;
        buyBoxWinnerShipping = shipping;
      }
      if (lowestLanded === null || landed < lowestLanded) {
        lowestLanded = landed;
        lowestListing = listing;
        lowestShipping = shipping;
      }
    }

    // Use the lowest of Summary buy box, Summary lowest, and IsBuyBoxWinner offer so we don't show an inflated price (e.g. $41 when Amazon shows $12.49).
    const summaryLowest = (() => {
      const lowestPrices = asArray(getField(summary, ["LowestPrices", "lowestPrices"]));
      const lowest = asObject(lowestPrices[0]);
      const landed = asObject(getField(lowest, ["LandedPrice", "landedPrice"]));
      return readNumber(landed?.Amount);
    })();
    const candidates: Array<{ landed: number; listing: number | null; shipping: number }> = [];
    if (buyBoxPrice !== null) candidates.push({ landed: buyBoxPrice, listing: listingPrice, shipping: shippingAmount ?? 0 });
    if (summaryLowest !== null) candidates.push({ landed: summaryLowest, listing: summaryLowest, shipping: 0 });
    if (buyBoxWinnerLanded !== null) candidates.push({ landed: buyBoxWinnerLanded, listing: buyBoxWinnerListing, shipping: buyBoxWinnerShipping ?? 0 });
    if (lowestLanded !== null) candidates.push({ landed: lowestLanded, listing: lowestListing, shipping: lowestShipping ?? 0 });
    if (candidates.length > 0) {
      const best = candidates.reduce((a, b) => (a.landed <= b.landed ? a : b));
      buyBoxPrice = best.landed;
      listingPrice = best.listing;
      shippingAmount = best.shipping;
    } else if (buyBoxPrice === null && lowestLanded !== null) {
      buyBoxPrice = lowestLanded;
      listingPrice = lowestListing;
      shippingAmount = lowestShipping ?? 0;
    }

    const sellerDetails: SellerOfferDetail[] = [];
    const sellerIds: string[] = [];
    const seenIds = new Set<string>();
    let fbaOfferCount = 0;
    let fbmOfferCount = 0;

    for (const offerRaw of offers) {
      const offer = asObject(offerRaw);
      const fulfilledByAmazon = getField(offer, ["IsFulfilledByAmazon", "isFulfilledByAmazon"]);
      const channelRaw = getField(offer, ["FulfillmentChannel", "fulfillmentChannel", "FulfillmentChannelCode", "fulfillmentChannelCode"]);
      const channel = (typeof channelRaw === "string" ? channelRaw : "").trim().toUpperCase();
      const explicitlyMerchant = /^MERCHANT$|^DEFAULT$|^MFN$/.test(channel);
      const explicitlyAmazon = /^AMAZON$|^AFN$|^FBA$/.test(channel);
      const isFba =
        explicitlyMerchant ? false : (explicitlyAmazon || fulfilledByAmazon === true || (typeof fulfilledByAmazon === "string" && fulfilledByAmazon.trim().toLowerCase() === "true"));
      if (isFba) {
        fbaOfferCount += 1;
      } else {
        fbmOfferCount += 1;
      }
      const sellerId = readString(
        getField(offer, ["SellerId", "sellerId", "SellerID", "seller_id"]),
      )?.trim();
      if (!sellerId) continue;
      const feedback = asObject(getField(offer, ["SellerFeedbackRating", "sellerFeedbackRating"]));
      const feedbackCount = readNumber(getField(feedback ?? null, ["FeedbackCount", "feedbackCount"]));
      const feedbackPercent = readNumber(
        getField(feedback ?? null, ["SellerPositiveFeedbackRating", "sellerPositiveFeedbackRating"]),
      );
      const sellerDisplayName =
        readString(
          getField(offer, [
            "SellerDisplayName",
            "sellerDisplayName",
            "StoreName",
            "storeName",
            "SellerName",
            "sellerName",
            "MerchantName",
            "merchantName",
            "DisplayName",
            "displayName",
          ]),
        )?.trim() || null;
      if (!seenIds.has(sellerId.toUpperCase())) {
        seenIds.add(sellerId.toUpperCase());
        sellerIds.push(sellerId);
      }
      sellerDetails.push({
        sellerId,
        channel: isFba ? "FBA" : "FBM",
        feedbackCount: feedbackCount ?? null,
        feedbackPercent: feedbackPercent ?? null,
        sellerDisplayName,
      });
    }
    if (fbaOfferCount === 0 && fbmOfferCount === 0 && offers.length > 0) {
      fbmOfferCount = offers.length;
    }
    if (offers.length > 0 && fbaOfferCount + fbmOfferCount !== offers.length) {
      const numberOfOffers = asArray(getField(summary, ["NumberOfOffers", "numberOfOffers"]));
      let summaryFba = 0;
      let summaryFbm = 0;
      for (const noRaw of numberOfOffers) {
        const no = asObject(noRaw);
        const fc = (readString(getField(no, ["FulfillmentChannel", "fulfillmentChannel"])) ?? "").toUpperCase();
        const count = readNumber(getField(no, ["OfferCount", "offerCount"])) ?? 0;
        if (/^AMAZON$|^AFN$|^FBA$/.test(fc)) summaryFba += count;
        else if (/^MERCHANT$|^DEFAULT$|^MFN$/.test(fc) || fc === "") summaryFbm += count;
      }
      if (summaryFba + summaryFbm > 0) {
        fbaOfferCount = summaryFba;
        fbmOfferCount = summaryFbm;
      }
    }

    return {
      buyBoxPrice: buyBoxPrice === null ? null : toCurrency(buyBoxPrice),
      listingPrice: listingPrice !== null ? toCurrency(listingPrice) : null,
      shippingAmount: shippingAmount !== null ? toCurrency(shippingAmount) : null,
      offerCount: offers.length,
      fbaOfferCount,
      fbmOfferCount,
      sellerIds,
      sellerDetails,
    };
  }

  private extractCompetitivePricingFallback(data: unknown): CompetitivePricing {
    const root = asObject(data);
    const payload = asArray(getField(root, ["payload", "Payload"]));
    if (payload.length === 0) {
      return { buyBoxPrice: null, listingPrice: null, shippingAmount: null, offerCount: null, fbaOfferCount: null, fbmOfferCount: null, sellerIds: [], sellerDetails: [] };
    }

    let bestPrice: number | null = null;
    for (const entryRaw of payload) {
      const entry = asObject(entryRaw);
      const product = asObject(getField(entry, ["Product", "product"]));
      const competitivePricing = asObject(getField(product, ["CompetitivePricing", "competitivePricing"]));
      const competitivePrices = asArray(getField(competitivePricing, ["CompetitivePrices", "competitivePrices"]));

      for (const priceRaw of competitivePrices) {
        const priceObj = asObject(priceRaw);
        const condition = readString(getField(priceObj, ["condition", "Condition"])) ?? "";
        if (condition && condition.toLowerCase() !== "new") {
          continue;
        }

        const priceBlock = asObject(getField(priceObj, ["Price", "price"]));
        const landedPrice = asObject(getField(priceBlock, ["LandedPrice", "landedPrice"]));
        const listingPrice = asObject(getField(priceBlock, ["ListingPrice", "listingPrice"]));
        const shippingPrice = asObject(getField(priceBlock, ["Shipping", "shipping"]));

        let candidatePrice = readNumber(landedPrice?.Amount);
        if (candidatePrice === null) {
          const listing = readNumber(listingPrice?.Amount);
          const shipping = readNumber(shippingPrice?.Amount) ?? 0;
          if (listing !== null) {
            candidatePrice = listing + shipping;
          }
        }

        if (candidatePrice !== null && (bestPrice === null || candidatePrice < bestPrice)) {
          bestPrice = candidatePrice;
        }
      }
    }

    return {
      buyBoxPrice: bestPrice === null ? null : toCurrency(bestPrice),
      listingPrice: null,
      shippingAmount: null,
      offerCount: null,
      fbaOfferCount: null,
      fbmOfferCount: null,
      sellerIds: [],
      sellerDetails: [],
    };
  }

  private extractFeeEstimate(data: unknown): FeeEstimate {
    const root = asObject(data);
    const payload = asObject(root?.payload);
    const result =
      asObject(payload?.FeesEstimateResult) ??
      asObject(asArray(payload?.FeesEstimateResultList)[0]);
    if (!result) {
      throw new Error("SP-API fee response missing FeesEstimateResult.");
    }

    const status = readString(result.Status);
    if (status && status.toLowerCase() !== "success") {
      const error = asObject(result.Error);
      const message = readString(error?.Message) ?? `Fee estimate status: ${status}`;
      throw new Error(message);
    }

    const estimate = asObject(result?.FeesEstimate);
    if (!estimate) {
      throw new Error("SP-API fee response missing fee breakdown.");
    }

    const totalFeesEstimate = asObject(estimate.TotalFeesEstimate);
    const totalFeesAmount = readNumber(totalFeesEstimate?.Amount);
    const feeDetails = asArray(estimate?.FeeDetailList);

    let referralFee = 0;
    let fulfillmentFee = 0;
    let otherFees = 0;

    for (const feeRaw of feeDetails) {
      const feeObj = asObject(feeRaw);
      if (!feeObj) {
        continue;
      }

      const feeType = readString(feeObj.FeeType) ?? "";
      const finalFee = asObject(feeObj.FinalFee);
      const amount = readNumber(finalFee?.Amount) ?? 0;

      if (/referral/i.test(feeType)) {
        referralFee += amount;
      } else if (/fba|fulfillment/i.test(feeType)) {
        fulfillmentFee += amount;
      } else {
        otherFees += amount;
      }
    }

    const fallbackTotal = referralFee + fulfillmentFee + otherFees;
    const totalFees = totalFeesAmount !== null && totalFeesAmount > 0 ? totalFeesAmount : fallbackTotal;

    return {
      referralFee: toCurrency(referralFee),
      fulfillmentFee: toCurrency(fulfillmentFee),
      totalFees: toCurrency(totalFees),
    };
  }

  private extractListingRestrictions(data: unknown): ListingRestrictionsAssessment {
    const root = asObject(data);
    const restrictions = asArray(getField(root, ["restrictions", "Restrictions"]));

    const reasonCodes: string[] = [];
    const reasonMessages: string[] = [];

    for (const restrictionRaw of restrictions) {
      const restriction = asObject(restrictionRaw);
      if (!restriction) {
        continue;
      }

      const reasons = asArray(getField(restriction, ["reasons", "Reasons"]));
      for (const reasonRaw of reasons) {
        const reason = asObject(reasonRaw);
        if (!reason) {
          continue;
        }

        const code = (readString(getField(reason, ["reasonCode", "ReasonCode"])) ?? "").trim();
        const message = (readString(getField(reason, ["reasonDescription", "ReasonDescription"])) ?? "").trim();
        if (code) {
          reasonCodes.push(code.toUpperCase());
        }
        if (message) {
          reasonMessages.push(message);
        }
      }
    }

    const allSignals = unique([...reasonCodes, ...reasonMessages.map((msg) => msg.toUpperCase())]).join(" | ");
    const approvalRequired = /APPROVAL|RESTRICT|GATED|NOT_ELIGIBLE|REQUIRES|APPLICATION/.test(allSignals);
    const ipComplaintRisk = /INTELLECTUAL|IP\b|TRADEMARK|PATENT|COPYRIGHT|COUNTERFEIT|BRAND_PROTECTION/.test(allSignals);
    const meltableRisk = /MELTABLE|MELT\s|HEAT\s*SENSITIVE/.test(allSignals);
    const privateLabelRisk = Boolean(
      approvalRequired && (ipComplaintRisk || /BRAND\s*GAT|BRAND_GAT|REGISTRY|PRIVATE\s*LABEL/.test(allSignals)),
    );
    const restricted = restrictions.length > 0;

    return {
      restricted,
      approvalRequired,
      ipComplaintRisk,
      meltableRisk,
      privateLabelRisk,
      reasonCodes: unique(reasonCodes),
      reasonMessages: unique(reasonMessages),
    };
  }

  async fetchCatalogItem(asin: string): Promise<CatalogItem | null> {
    const normalized = asin.trim().toUpperCase();
    if (!ASIN_REGEX.test(normalized)) {
      return null;
    }

    const cached = await getCatalogItemCache(this.config.marketplaceId, normalized);
    if (cached) {
      return cached;
    }

    const response = await this.request<unknown>("GET", `/catalog/2022-04-01/items/${normalized}`, {
      query: {
        marketplaceIds: this.config.marketplaceId,
        includedData: "summaries,salesRanks,identifiers,images,relationships",
      },
    });

    const item = this.extractCatalogItem(response);
    if (item) {
      void setCatalogItemCache(this.config.marketplaceId, normalized, item);
    }
    return item;
  }

  private async searchCatalogByIdentifier(identifierType: "UPC" | "EAN" | "GTIN", identifier: string): Promise<CatalogItem | null> {
    const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
      query: {
        marketplaceIds: this.config.marketplaceId,
        identifiersType: identifierType,
        identifiers: identifier,
        includedData: "summaries,salesRanks,identifiers,images,relationships",
      },
    });

    const root = asObject(response);
    const items = asArray(root?.items);
    if (items.length === 0) {
      return null;
    }

    return this.extractCatalogItem(items[0]);
  }

  async searchCatalogByKeyword(keyword: string): Promise<CatalogItem | null> {
    const query = keyword.trim();
    if (!query) {
      return null;
    }

    const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
      query: {
        marketplaceIds: this.config.marketplaceId,
        keywords: query,
        includedData: "summaries,salesRanks,identifiers,images,relationships",
        pageSize: "20",
      },
    });

    const root = asObject(response);
    const items = asArray(root?.items);
    if (items.length === 0) {
      return null;
    }

    const parsedItems = items
      .map((item) => this.extractCatalogItem(item))
      .filter((item): item is CatalogItem => Boolean(item));

    if (parsedItems.length === 0) {
      return null;
    }

    const normalizedQuery = query.toLowerCase();
    const titleMatch = parsedItems.find((item) => item.title.toLowerCase().includes(normalizedQuery));
    if (titleMatch) {
      return titleMatch;
    }

    return parsedItems[0];
  }

  /** Returns catalog items for keyword search, paginating until maxResults or no more pages. Amazon caps at 1000 per search. */
  async searchCatalogByKeywordMultiple(
    keyword: string,
    maxResults: number = 1000,
  ): Promise<CatalogItem[]> {
    const query = keyword.trim();
    if (!query) {
      return [];
    }

    const pageSize = 20;
    const allItems: CatalogItem[] = [];
    let pageToken: string | null = null;

    do {
      const queryParams: Record<string, string> = {
        marketplaceIds: this.config.marketplaceId,
        keywords: query,
        includedData: "summaries,salesRanks,identifiers,images,relationships",
        pageSize: String(pageSize),
      };
      if (pageToken) {
        queryParams.pageToken = pageToken;
      }

      const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
        query: queryParams,
      });

      const root = asObject(response);
      const items = asArray(root?.items);
      const parsedItems = items
        .map((item) => this.extractCatalogItem(item))
        .filter((item): item is CatalogItem => Boolean(item));
      allItems.push(...parsedItems);

      if (allItems.length >= maxResults) {
        break;
      }

      const pagination = asObject(getField(root, ["pagination", "Pagination"]));
      const nextToken = readString(getField(pagination, ["nextToken", "NextToken"]));
      pageToken = nextToken || null;
    } while (pageToken);

    return allItems.slice(0, maxResults);
  }

  /**
   * Fetches one page of catalog search results (e.g. 500 at a time).
   * Use nextPageToken from the response for the next "Load more" request.
   */
  async searchCatalogByKeywordPage(
    keyword: string,
    pageToken?: string | null,
    pageSize: number = 500,
  ): Promise<{ items: CatalogItem[]; nextPageToken: string | null }> {
    const query = keyword.trim();
    if (!query) {
      return { items: [], nextPageToken: null };
    }

    const perRequest = 20;
    const items: CatalogItem[] = [];
    let token: string | null = pageToken ?? null;

    while (items.length < pageSize) {
      const queryParams: Record<string, string> = {
        marketplaceIds: this.config.marketplaceId,
        keywords: query,
        includedData: "summaries,salesRanks,identifiers,images,relationships",
        pageSize: String(perRequest),
      };
      if (token) {
        queryParams.pageToken = token;
      }

      const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
        query: queryParams,
      });

      const root = asObject(response);
      const rawItems = asArray(root?.items);
      const parsedItems = rawItems
        .map((item) => this.extractCatalogItem(item))
        .filter((item): item is CatalogItem => Boolean(item));
      items.push(...parsedItems);

      const pagination = asObject(getField(root, ["pagination", "Pagination"]));
      const nextToken = readString(getField(pagination, ["nextToken", "NextToken"]));
      token = nextToken || null;

      if (!token || items.length >= pageSize) {
        break;
      }
    }

    return {
      items: items.slice(0, pageSize),
      nextPageToken: token,
    };
  }

  async resolveCatalogItem(identifier: string): Promise<CatalogItem | null> {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }

    const asinCandidate = extractAsinCandidate(normalized);
    if (asinCandidate) {
      const asinResult = await this.fetchCatalogItem(asinCandidate).catch(() => null);
      if (asinResult) {
        return asinResult;
      }
    }

    const digits = normalized.replace(/\D/g, "");
    if (UPC_EAN_REGEX.test(digits)) {
      const identifierCandidates = buildNumericIdentifierCandidates(digits);
      for (const candidate of identifierCandidates) {
      const identifierTypes: Array<"UPC" | "EAN" | "GTIN"> =
        candidate.length === 13
          ? ["EAN", "GTIN", "UPC"]
          : candidate.length === 12
            ? ["UPC", "GTIN", "EAN"]
            : ["GTIN", "UPC", "EAN"];

        for (const identifierType of identifierTypes) {
          // Sequential tries improve reliability for mixed UPC/EAN supplier data.
          const match = await this.searchCatalogByIdentifier(identifierType, candidate).catch(() => null);
          if (match) {
            return match;
          }
        }
      }
    }

    return null;
  }

  async fetchCompetitivePricing(asin: string): Promise<CompetitivePricing> {
    let primaryError: Error | null = null;
    let primaryPricing: CompetitivePricing = {
      buyBoxPrice: null,
      listingPrice: null,
      shippingAmount: null,
      offerCount: null,
      fbaOfferCount: null,
      fbmOfferCount: null,
      sellerIds: [],
      sellerDetails: [],
    };

    try {
      const response = await this.request<unknown>("GET", `/products/pricing/v0/items/${asin}/offers`, {
        query: {
          MarketplaceId: this.config.marketplaceId,
          ItemCondition: "New",
          CustomerType: "Consumer",
        },
      });
      primaryPricing = this.extractPricing(response);
      if (primaryPricing.buyBoxPrice !== null) {
        return primaryPricing;
      }
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error("Primary pricing request failed.");
    }

    try {
      const fallbackResponse = await this.request<unknown>("GET", "/products/pricing/v0/competitivePrice", {
        query: {
          MarketplaceId: this.config.marketplaceId,
          Asins: asin,
          ItemType: "Asin",
        },
      });
      const fallbackPricing = this.extractCompetitivePricingFallback(fallbackResponse);
      if (fallbackPricing.buyBoxPrice !== null) {
        const hasOffersData = primaryError === null;
        return {
          buyBoxPrice: fallbackPricing.buyBoxPrice,
          listingPrice: fallbackPricing.listingPrice,
          shippingAmount: fallbackPricing.shippingAmount,
          offerCount: hasOffersData ? primaryPricing.offerCount : null,
          fbaOfferCount: hasOffersData ? primaryPricing.fbaOfferCount : null,
          fbmOfferCount: hasOffersData ? primaryPricing.fbmOfferCount : null,
          sellerIds: hasOffersData ? (primaryPricing.sellerIds ?? []) : [],
          sellerDetails: hasOffersData ? (primaryPricing.sellerDetails ?? []) : [],
        };
      }
    } catch (fallbackError) {
      if (primaryError) {
        throw primaryError;
      }
      throw fallbackError instanceof Error ? fallbackError : new Error("Fallback pricing request failed.");
    }

    if (primaryError) {
      throw primaryError;
    }

    return primaryPricing;
  }

  /**
   * Fetch all offers (listings) for an ASIN for "all listings" view (like Seller Central).
   * Returns one row per offer with price, channel, condition, and optional seller/feedback.
   */
  async fetchItemOffersList(asin: string): Promise<ItemOfferRow[]> {
    const response = await this.request<unknown>("GET", `/products/pricing/v0/items/${asin}/offers`, {
      query: {
        MarketplaceId: this.config.marketplaceId,
        ItemCondition: "New",
        CustomerType: "Consumer",
      },
    });
    return this.extractOffersList(response);
  }

  private extractOffersList(data: unknown): ItemOfferRow[] {
    const root = asObject(data);
    let payload = asObject(getField(root, ["payload", "Payload"]));
    if (!payload) payload = root;
    const offers = asArray(getField(payload, ["Offers", "offers"]));
    const out: ItemOfferRow[] = [];
    for (const offerRaw of offers) {
      const offer = asObject(offerRaw);
      const listingPriceObj = asObject(getField(offer, ["ListingPrice", "listingPrice"]));
      const shippingObj = asObject(getField(offer, ["Shipping", "shipping"]));
      const listing = readNumber(listingPriceObj?.Amount);
      const shipping = readNumber(shippingObj?.Amount) ?? 0;
      if (listing === null) continue;
      const landed = toCurrency(listing + shipping);
      const listingR = toCurrency(listing);
      const fulfilledByAmazon = getField(offer, ["IsFulfilledByAmazon", "isFulfilledByAmazon"]);
      const channelRaw = getField(offer, ["FulfillmentChannel", "fulfillmentChannel", "FulfillmentChannelCode", "fulfillmentChannelCode"]);
      const channelStr = (typeof channelRaw === "string" ? channelRaw : "").trim().toUpperCase();
      const explicitlyMerchant = /^MERCHANT$|^DEFAULT$|^MFN$/.test(channelStr);
      const explicitlyAmazon = /^AMAZON$|^AFN$|^FBA$/.test(channelStr);
      const isFba =
        explicitlyMerchant ? false : (explicitlyAmazon || fulfilledByAmazon === true || (typeof fulfilledByAmazon === "string" && fulfilledByAmazon.trim().toLowerCase() === "true"));
      const condition = readString(getField(offer, ["Condition", "condition", "ConditionSubcondition", "conditionSubcondition"])) ?? "New";
      const sellerId = readString(getField(offer, ["SellerId", "sellerId", "SellerID", "seller_id"]))?.trim() ?? null;
      const feedback = asObject(getField(offer, ["SellerFeedbackRating", "sellerFeedbackRating"]));
      const feedbackCount = readNumber(getField(feedback ?? null, ["FeedbackCount", "feedbackCount"]));
      const feedbackPercent = readNumber(
        getField(feedback ?? null, ["SellerPositiveFeedbackRating", "sellerPositiveFeedbackRating"]),
      );
      out.push({
        listingPrice: listingR,
        shippingAmount: toCurrency(shipping),
        landedPrice: landed,
        channel: isFba ? "FBA" : "FBM",
        condition,
        sellerId,
        feedbackCount: feedbackCount ?? null,
        feedbackPercent: feedbackPercent ?? null,
      });
    }
    return out;
  }

  async fetchFeeEstimate(
    asin: string,
    priceForFees: { listingPrice: number; shippingAmount: number },
    sellerType: SellerType,
  ): Promise<FeeEstimate> {
    const { listingPrice, shippingAmount } = priceForFees;
    const response = await this.request<unknown>("POST", `/products/fees/v0/items/${asin}/feesEstimate`, {
      body: {
        FeesEstimateRequest: {
          MarketplaceId: this.config.marketplaceId,
          IsAmazonFulfilled: sellerType === "FBA",
          Identifier: `${this.config.sellerId || asin}-${Date.now()}`,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: "USD",
              Amount: listingPrice,
            },
            Shipping: {
              CurrencyCode: "USD",
              Amount: shippingAmount,
            },
            Points: {
              PointsNumber: 0,
              PointsMonetaryValue: {
                CurrencyCode: "USD",
                Amount: 0,
              },
            },
          },
        },
      },
    });

    return this.extractFeeEstimate(response);
  }

  async fetchListingRestrictions(asin: string): Promise<ListingRestrictionsAssessment> {
    const cacheKey = `${this.config.marketplaceId}:${this.config.sellerId}:${asin}`;
    const cached = listingRestrictionsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await this.request<unknown>("GET", "/listings/2021-08-01/restrictions", {
      query: {
        asin,
        sellerId: this.config.sellerId,
        marketplaceIds: this.config.marketplaceId,
        conditionType: "new_new",
      },
    });

    const parsed = this.extractListingRestrictions(response);
    listingRestrictionsCache.set(cacheKey, parsed);
    return parsed;
  }
}

const spApiClientByMarketplace = new Map<string, SpApiClient>();

/**
 * Returns an SP-API client. When marketplaceIdOverride is provided (e.g. from user preferences),
 * uses that marketplace; otherwise uses MARKETPLACE_ID from env.
 */
export function getSpApiClient(marketplaceIdOverride?: string | null): SpApiClient {
  if (marketplaceIdOverride?.trim()) {
    const key = marketplaceIdOverride.trim();
    let client = spApiClientByMarketplace.get(key);
    if (!client) {
      client = new SpApiClient(readSpApiConfig(key));
      spApiClientByMarketplace.set(key, client);
    }
    return client;
  }
  if (!spApiClientSingleton) {
    spApiClientSingleton = new SpApiClient(readSpApiConfig());
  }
  return spApiClientSingleton;
}
