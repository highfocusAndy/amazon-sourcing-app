import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import aws4 from "aws4";

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
  amazonSellerIds: Set<string>;
}

interface LwaTokenCache {
  token: string;
  expiresAt: number;
}

export interface CatalogItem {
  asin: string;
  title: string;
  brand: string;
  rank: number | null;
  imageUrl: string | null;
}

export interface CompetitivePricing {
  buyBoxPrice: number | null;
  amazonIsSeller: boolean | null;
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
  reasonCodes: string[];
  reasonMessages: string[];
}

const AMAZON_RETAIL_SELLER_ID = "ATVPDKIKX0DER";
const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const UPC_EAN_REGEX = /^\d{8,14}$/;
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

let lwaTokenCache: LwaTokenCache | null = null;
let assumedRoleCache: AwsCredentials | null = null;
let spApiClientSingleton: SpApiClient | null = null;
const listingRestrictionsCache = new Map<string, ListingRestrictionsAssessment>();

function defaultSpApiHost(awsRegion: string): string {
  if (awsRegion.startsWith("eu-")) {
    return "sellingpartnerapi-eu.amazon.com";
  }
  if (awsRegion.startsWith("ap-")) {
    return "sellingpartnerapi-fe.amazon.com";
  }
  return "sellingpartnerapi-na.amazon.com";
}

function parseAmazonSellerIds(raw: string | undefined, marketplaceId: string): Set<string> {
  const values = new Set<string>([AMAZON_RETAIL_SELLER_ID, marketplaceId.toUpperCase()]);
  if (!raw) {
    return values;
  }

  for (const value of raw.split(",")) {
    const normalized = value.trim().toUpperCase();
    if (normalized) {
      values.add(normalized);
    }
  }
  return values;
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

function readSpApiConfig(): SpApiConfig {
  const awsRegion = process.env.AWS_REGION?.trim() || "us-east-1";
  const marketplaceId = requiredEnvFromList(["MARKETPLACE_ID", "SP_API_MARKETPLACE_ID"]);
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
    amazonSellerIds: parseAmazonSellerIds(process.env.AMAZON_SELLER_IDS, marketplaceId),
  };
}

export class SpApiClient {
  constructor(private readonly config: SpApiConfig = readSpApiConfig()) {}

  private async getLwaAccessToken(): Promise<string> {
    const now = Date.now();
    if (lwaTokenCache && lwaTokenCache.expiresAt - 60_000 > now) {
      return lwaTokenCache.token;
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
    lwaTokenCache = {
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
    if (assumedRoleCache?.expiresAt && assumedRoleCache.expiresAt - 60_000 > now) {
      return assumedRoleCache;
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

    assumedRoleCache = {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiresAt: credentials.Expiration ? credentials.Expiration.getTime() : now + 3600 * 1000,
    };

    return assumedRoleCache;
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

      const responseError = new Error(
        `SP-API request failed (${response.status}) on ${method} ${path}${raw ? `: ${raw.slice(0, 500)}` : ""}`,
      );
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
    const brand = readString(summary?.brandName) ?? "";

    const salesRanks = asArray(itemObj.salesRanks);
    let rank: number | null = null;
    for (const rankGroupRaw of salesRanks) {
      const rankGroup = asObject(rankGroupRaw);
      if (!rankGroup) {
        continue;
      }

      const groupedRanks = asArray(rankGroup.classificationRanks).concat(asArray(rankGroup.displayGroupRanks));
      for (const rankRaw of groupedRanks) {
        const rankObj = asObject(rankRaw);
        const parsedRank = readNumber(rankObj?.rank);
        if (parsedRank !== null) {
          rank = parsedRank;
          break;
        }
      }

      if (rank !== null) {
        break;
      }
    }

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

    return { asin, title, brand, rank, imageUrl };
  }

  private extractPricing(data: unknown): CompetitivePricing {
    const root = asObject(data);
    const payload = asObject(getField(root, ["payload", "Payload"]));
    const summary = asObject(getField(payload, ["Summary", "summary"]));
    const offers = asArray(getField(payload, ["Offers", "offers"]));

    const buyBoxPrices = asArray(getField(summary, ["BuyBoxPrices", "buyBoxPrices"]));
    const buyBox = asObject(buyBoxPrices[0]);
    const buyBoxLandedPrice = asObject(getField(buyBox, ["LandedPrice", "landedPrice"]));

    let buyBoxPrice = readNumber(buyBoxLandedPrice?.Amount);
    if (buyBoxPrice === null) {
      const lowestPrices = asArray(getField(summary, ["LowestPrices", "lowestPrices"]));
      const lowest = asObject(lowestPrices[0]);
      const landed = asObject(getField(lowest, ["LandedPrice", "landedPrice"]));
      buyBoxPrice = readNumber(landed?.Amount);
    }

    if (buyBoxPrice === null) {
      for (const offerRaw of offers) {
        const offer = asObject(offerRaw);
        const listingPrice = asObject(getField(offer, ["ListingPrice", "listingPrice"]));
        const shippingPrice = asObject(getField(offer, ["Shipping", "shipping"]));
        const listing = readNumber(listingPrice?.Amount);
        const shipping = readNumber(shippingPrice?.Amount) ?? 0;
        if (listing === null) {
          continue;
        }
        const landed = listing + shipping;
        if (buyBoxPrice === null || landed < buyBoxPrice) {
          buyBoxPrice = landed;
        }
      }
    }

    const amazonIsSeller = offers.some((offerRaw) => {
      const offer = asObject(offerRaw);
      const sellerId = readString(getField(offer, ["SellerId", "sellerId"]))?.toUpperCase();
      return Boolean(sellerId && this.config.amazonSellerIds.has(sellerId));
    });

    return {
      buyBoxPrice: buyBoxPrice === null ? null : toCurrency(buyBoxPrice),
      amazonIsSeller,
    };
  }

  private extractCompetitivePricingFallback(data: unknown): CompetitivePricing {
    const root = asObject(data);
    const payload = asArray(getField(root, ["payload", "Payload"]));
    if (payload.length === 0) {
      return { buyBoxPrice: null, amazonIsSeller: null };
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
      amazonIsSeller: null,
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
    const ipComplaintRisk = /INTELLECTUAL|IP|TRADEMARK|PATENT|COPYRIGHT|COUNTERFEIT|BRAND_PROTECTION/.test(allSignals);
    const restricted = restrictions.length > 0;

    return {
      restricted,
      approvalRequired,
      ipComplaintRisk,
      reasonCodes: unique(reasonCodes),
      reasonMessages: unique(reasonMessages),
    };
  }

  async fetchCatalogItem(asin: string): Promise<CatalogItem | null> {
    const response = await this.request<unknown>("GET", `/catalog/2022-04-01/items/${asin}`, {
      query: {
        marketplaceIds: this.config.marketplaceId,
        includedData: "summaries,salesRanks,identifiers,images",
      },
    });

    return this.extractCatalogItem(response);
  }

  private async searchCatalogByIdentifier(identifierType: "UPC" | "EAN" | "GTIN", identifier: string): Promise<CatalogItem | null> {
    const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
      query: {
        marketplaceIds: this.config.marketplaceId,
        identifiersType: identifierType,
        identifiers: identifier,
        includedData: "summaries,salesRanks,identifiers,images",
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
        includedData: "summaries,salesRanks,identifiers,images",
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
    let primaryPricing: CompetitivePricing = { buyBoxPrice: null, amazonIsSeller: null };

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
        return {
          buyBoxPrice: fallbackPricing.buyBoxPrice,
          amazonIsSeller:
            primaryPricing.amazonIsSeller === true
              ? true
              : fallbackPricing.amazonIsSeller,
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

  async fetchFeeEstimate(asin: string, buyBoxPrice: number, sellerType: SellerType): Promise<FeeEstimate> {
    const response = await this.request<unknown>("POST", `/products/fees/v0/items/${asin}/feesEstimate`, {
      body: {
        FeesEstimateRequest: {
          MarketplaceId: this.config.marketplaceId,
          IsAmazonFulfilled: sellerType === "FBA",
          Identifier: `${this.config.sellerId || asin}-${Date.now()}`,
          PriceToEstimateFees: {
            ListingPrice: {
              CurrencyCode: "USD",
              Amount: buyBoxPrice,
            },
            Shipping: {
              CurrencyCode: "USD",
              Amount: 0,
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

export function getSpApiClient(): SpApiClient {
  if (!spApiClientSingleton) {
    spApiClientSingleton = new SpApiClient();
  }
  return spApiClientSingleton;
}
