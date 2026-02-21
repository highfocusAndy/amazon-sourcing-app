import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import aws4 from "aws4";

import { getServerEnv, type ServerEnv } from "@/lib/env";
import type { FeePreview, SellerType } from "@/lib/types";

type RequestMethod = "GET" | "POST";

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number;
}

interface LwaTokenCache {
  token: string;
  expiresAt: number;
}

interface CatalogBasics {
  asin: string | null;
  brand: string;
  salesRank: number | null;
}

interface OffersBasics {
  buyBoxPrice: number | null;
  amazonIsSeller: boolean;
}

const AMAZON_SELLER_ID = "ATVPDKIKX0DER";
const ASIN_REGEX = /^[A-Z0-9]{10}$/i;
const UPC_EAN_REGEX = /^\d{11,14}$/;

let lwaTokenCache: LwaTokenCache | null = null;
let assumedRoleCache: AwsCredentials | null = null;

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  return trimmed ? trimmed : null;
}

function roundCurrency(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function normalizeIdentifier(raw: string): string {
  return raw.replace(/\u200b/g, "").trim();
}

function cleanDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function getLwaAccessToken(env: ServerEnv): Promise<string> {
  const now = Date.now();
  if (lwaTokenCache && lwaTokenCache.expiresAt - 60_000 > now) {
    return lwaTokenCache.token;
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: env.refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
  });

  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: payload.toString(),
    cache: "no-store",
  });

  const responseText = await response.text();
  const json = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new Error(`LWA token request failed (${response.status}): ${responseText}`);
  }

  const token = readString(json.access_token);
  if (!token) {
    throw new Error("LWA token response did not include access_token");
  }

  const expiresIn = readNumber(json.expires_in) ?? 3600;
  lwaTokenCache = {
    token,
    expiresAt: now + expiresIn * 1000,
  };

  return token;
}

async function getAwsCredentials(env: ServerEnv): Promise<AwsCredentials> {
  if (!env.awsRoleArn) {
    return {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
      sessionToken: env.awsSessionToken,
    };
  }

  const now = Date.now();
  if (assumedRoleCache?.expiresAt && assumedRoleCache.expiresAt - 60_000 > now) {
    return assumedRoleCache;
  }

  const stsClient = new STSClient({
    region: env.awsRegion,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
      sessionToken: env.awsSessionToken,
    },
  });

  const assumeRole = await stsClient.send(
    new AssumeRoleCommand({
      RoleArn: env.awsRoleArn,
      RoleSessionName: env.awsRoleSessionName,
      DurationSeconds: 3600,
    }),
  );

  const credentials = assumeRole.Credentials;
  if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) {
    throw new Error("STS AssumeRole response did not include valid credentials");
  }

  assumedRoleCache = {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiresAt: credentials.Expiration ? credentials.Expiration.getTime() : now + 3600 * 1000,
  };

  return assumedRoleCache;
}

async function spApiRequest<T>(
  method: RequestMethod,
  path: string,
  options?: {
    query?: Record<string, string>;
    body?: unknown;
  },
): Promise<T> {
  const env = getServerEnv();
  const [accessToken, awsCredentials] = await Promise.all([getLwaAccessToken(env), getAwsCredentials(env)]);
  const queryString = options?.query ? `?${new URLSearchParams(options.query).toString()}` : "";
  const requestBody = options?.body ? JSON.stringify(options.body) : undefined;
  const signedRequest = aws4.sign(
    {
      service: "execute-api",
      region: env.spApiRegion,
      host: env.spApiHost,
      method,
      path: `${path}${queryString}`,
      headers: {
        host: env.spApiHost,
        "x-amz-access-token": accessToken,
        "content-type": "application/json",
      },
      body: requestBody,
    },
    {
      accessKeyId: awsCredentials.accessKeyId,
      secretAccessKey: awsCredentials.secretAccessKey,
      sessionToken: awsCredentials.sessionToken,
    },
  );

  const response = await fetch(`https://${env.spApiHost}${signedRequest.path}`, {
    method,
    headers: signedRequest.headers as Record<string, string>,
    body: requestBody,
    cache: "no-store",
  });

  const responseText = await response.text();
  const json = responseText ? (JSON.parse(responseText) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(`SP-API request failed (${response.status}) for ${method} ${path}: ${responseText}`);
  }

  return json;
}

function extractCatalogBasics(item: unknown): CatalogBasics {
  const itemObj = asObject(item);
  if (!itemObj) {
    return {
      asin: null,
      brand: "",
      salesRank: null,
    };
  }

  const directAsin = readString(itemObj.asin);
  const identifiers = asObject(itemObj.identifiers);
  const marketplaceAsin = asObject(identifiers?.marketplaceASIN);
  const asin = directAsin ?? readString(marketplaceAsin?.asin) ?? null;

  const summaries = asArray(itemObj.summaries);
  const summary = asObject(summaries[0]);
  const brand = readString(summary?.brandName) ?? "";

  const salesRanks = asArray(itemObj.salesRanks);
  let salesRank: number | null = null;

  for (const salesRankGroupRaw of salesRanks) {
    const salesRankGroup = asObject(salesRankGroupRaw);
    if (!salesRankGroup) {
      continue;
    }

    const classificationRanks = asArray(salesRankGroup.classificationRanks);
    const displayRanks = asArray(salesRankGroup.displayGroupRanks);
    const mergedRanks = classificationRanks.length > 0 ? classificationRanks : displayRanks;

    for (const rankRaw of mergedRanks) {
      const rankObj = asObject(rankRaw);
      const rank = readNumber(rankObj?.rank);
      if (rank !== null) {
        salesRank = rank;
        break;
      }
    }

    if (salesRank !== null) {
      break;
    }
  }

  return {
    asin,
    brand,
    salesRank,
  };
}

function extractOffersBasics(payload: unknown): OffersBasics {
  const root = asObject(payload);
  const payloadObj = asObject(root?.payload);
  const summary = asObject(payloadObj?.Summary);
  const offers = asArray(payloadObj?.Offers);

  let buyBoxPrice: number | null = null;
  const buyBoxPrices = asArray(summary?.BuyBoxPrices);
  const buyBox = asObject(buyBoxPrices[0]);
  const landedPrice = asObject(buyBox?.LandedPrice);
  buyBoxPrice = readNumber(landedPrice?.Amount);

  if (buyBoxPrice === null) {
    const lowestPrices = asArray(summary?.LowestPrices);
    const lowest = asObject(lowestPrices[0]);
    const lowLanded = asObject(lowest?.LandedPrice);
    buyBoxPrice = readNumber(lowLanded?.Amount);
  }

  let amazonIsSeller = false;
  for (const offerRaw of offers) {
    const offer = asObject(offerRaw);
    const sellerId = readString(offer?.SellerId);
    if (sellerId === AMAZON_SELLER_ID) {
      amazonIsSeller = true;
      break;
    }
  }

  return {
    buyBoxPrice: roundCurrency(buyBoxPrice),
    amazonIsSeller,
  };
}

function extractFeePreview(payload: unknown): FeePreview {
  const root = asObject(payload);
  const payloadObj = asObject(root?.payload);
  const result = asObject(payloadObj?.FeesEstimateResult);
  const estimate = asObject(result?.FeesEstimate);
  const total = asObject(estimate?.TotalFeesEstimate);
  const feeDetails = asArray(estimate?.FeeDetailList);

  let referralFee = 0;
  let fbaFee = 0;
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
      fbaFee += amount;
    }
  }

  const totalFees = readNumber(total?.Amount);
  const fallbackTotal = referralFee + fbaFee;

  return {
    referralFee: Math.round(referralFee * 100) / 100,
    fbaFee: Math.round(fbaFee * 100) / 100,
    totalFees: Math.round((totalFees ?? fallbackTotal) * 100) / 100,
  };
}

async function fetchCatalogByAsin(asin: string): Promise<CatalogBasics | null> {
  const catalog = await spApiRequest<unknown>("GET", `/catalog/2022-04-01/items/${asin}`, {
    query: {
      marketplaceIds: getServerEnv().marketplaceId,
      includedData: "summaries,salesRanks,identifiers",
    },
  });

  const parsed = extractCatalogBasics(catalog);
  if (!parsed.asin) {
    return null;
  }
  return parsed;
}

async function searchCatalogByIdentifier(
  identifierType: "UPC" | "EAN",
  identifier: string,
): Promise<CatalogBasics | null> {
  const response = await spApiRequest<unknown>("GET", "/catalog/2022-04-01/items", {
    query: {
      marketplaceIds: getServerEnv().marketplaceId,
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

  const parsed = extractCatalogBasics(items[0]);
  if (!parsed.asin) {
    return null;
  }
  return parsed;
}

export async function resolveCatalogItem(identifier: string): Promise<CatalogBasics | null> {
  const normalized = normalizeIdentifier(identifier);

  if (ASIN_REGEX.test(normalized)) {
    return fetchCatalogByAsin(normalized.toUpperCase());
  }

  const digits = cleanDigits(normalized);
  if (!UPC_EAN_REGEX.test(digits)) {
    return null;
  }

  const [upcResult, eanResult] = await Promise.all([
    searchCatalogByIdentifier("UPC", digits).catch(() => null),
    searchCatalogByIdentifier("EAN", digits).catch(() => null),
  ]);

  return upcResult ?? eanResult;
}

export async function fetchOffersForAsin(asin: string): Promise<OffersBasics> {
  const offers = await spApiRequest<unknown>("GET", `/products/pricing/v0/items/${asin}/offers`, {
    query: {
      MarketplaceId: getServerEnv().marketplaceId,
      ItemCondition: "New",
    },
  });

  return extractOffersBasics(offers);
}

export async function fetchFeePreviewForAsin(
  asin: string,
  buyBoxPrice: number,
  sellerType: SellerType,
): Promise<FeePreview> {
  const fees = await spApiRequest<unknown>("POST", `/products/fees/v0/items/${asin}/feesEstimate`, {
    body: {
      FeesEstimateRequest: {
        MarketplaceId: getServerEnv().marketplaceId,
        IsAmazonFulfilled: sellerType === "FBA",
        Identifier: `${asin}-${Date.now()}`,
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

  return extractFeePreview(fees);
}
