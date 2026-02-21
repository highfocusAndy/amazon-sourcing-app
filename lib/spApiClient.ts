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
}

export interface CompetitivePricing {
  buyBoxPrice: number | null;
  amazonIsSeller: boolean;
}

export interface FeeEstimate {
  referralFee: number;
  fulfillmentFee: number;
  totalFees: number;
}

const AMAZON_RETAIL_SELLER_ID = "ATVPDKIKX0DER";
const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const UPC_EAN_REGEX = /^\d{11,14}$/;

let lwaTokenCache: LwaTokenCache | null = null;
let assumedRoleCache: AwsCredentials | null = null;
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

function toCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().replace(/\u200b/g, "");
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

    if (!response.ok) {
      throw new Error(`SP-API request failed (${response.status}) on ${method} ${path}`);
    }

    return json as T;
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

    return { asin, title, brand, rank };
  }

  private extractPricing(data: unknown): CompetitivePricing {
    const root = asObject(data);
    const payload = asObject(root?.payload);
    const summary = asObject(payload?.Summary);
    const offers = asArray(payload?.Offers);

    const buyBoxPrices = asArray(summary?.BuyBoxPrices);
    const buyBox = asObject(buyBoxPrices[0]);
    const buyBoxLandedPrice = asObject(buyBox?.LandedPrice);

    let buyBoxPrice = readNumber(buyBoxLandedPrice?.Amount);
    if (buyBoxPrice === null) {
      const lowestPrices = asArray(summary?.LowestPrices);
      const lowest = asObject(lowestPrices[0]);
      const landed = asObject(lowest?.LandedPrice);
      buyBoxPrice = readNumber(landed?.Amount);
    }

    if (buyBoxPrice === null) {
      for (const offerRaw of offers) {
        const offer = asObject(offerRaw);
        const listingPrice = asObject(offer?.ListingPrice);
        const shippingPrice = asObject(offer?.Shipping);
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
      return readString(offer?.SellerId) === AMAZON_RETAIL_SELLER_ID;
    });

    return {
      buyBoxPrice: buyBoxPrice === null ? null : toCurrency(buyBoxPrice),
      amazonIsSeller,
    };
  }

  private extractFeeEstimate(data: unknown): FeeEstimate {
    const root = asObject(data);
    const payload = asObject(root?.payload);
    const result = asObject(payload?.FeesEstimateResult);
    const estimate = asObject(result?.FeesEstimate);
    const feeDetails = asArray(estimate?.FeeDetailList);

    let referralFee = 0;
    let fulfillmentFee = 0;

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
      }
    }

    return {
      referralFee: toCurrency(referralFee),
      fulfillmentFee: toCurrency(fulfillmentFee),
      totalFees: toCurrency(referralFee + fulfillmentFee),
    };
  }

  async fetchCatalogItem(asin: string): Promise<CatalogItem | null> {
    const response = await this.request<unknown>("GET", `/catalog/2022-04-01/items/${asin}`, {
      query: {
        marketplaceIds: this.config.marketplaceId,
        includedData: "summaries,salesRanks,identifiers",
      },
    });

    return this.extractCatalogItem(response);
  }

  private async searchCatalogByIdentifier(identifierType: "UPC" | "EAN", identifier: string): Promise<CatalogItem | null> {
    const response = await this.request<unknown>("GET", "/catalog/2022-04-01/items", {
      query: {
        marketplaceIds: this.config.marketplaceId,
        identifiersType: identifierType,
        identifiers: identifier,
        includedData: "summaries,salesRanks,identifiers",
      },
    });

    const root = asObject(response);
    const items = asArray(root?.items);
    if (items.length === 0) {
      return null;
    }

    return this.extractCatalogItem(items[0]);
  }

  async resolveCatalogItem(identifier: string): Promise<CatalogItem | null> {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }

    if (ASIN_REGEX.test(normalized)) {
      return this.fetchCatalogItem(normalized.toUpperCase());
    }

    const digits = normalized.replace(/\D/g, "");
    if (!UPC_EAN_REGEX.test(digits)) {
      return null;
    }

    const [upc, ean] = await Promise.all([
      this.searchCatalogByIdentifier("UPC", digits).catch(() => null),
      this.searchCatalogByIdentifier("EAN", digits).catch(() => null),
    ]);
    return upc ?? ean;
  }

  async fetchCompetitivePricing(asin: string): Promise<CompetitivePricing> {
    const response = await this.request<unknown>("GET", `/products/pricing/v0/items/${asin}/offers`, {
      query: {
        MarketplaceId: this.config.marketplaceId,
        ItemCondition: "New",
      },
    });

    return this.extractPricing(response);
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
}

export function getSpApiClient(): SpApiClient {
  if (!spApiClientSingleton) {
    spApiClientSingleton = new SpApiClient();
  }
  return spApiClientSingleton;
}
