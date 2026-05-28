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
  /** Lowest available landed price across all offers (may be lower than buy box). */
  lowestPrice: number | null;
  amazonIsSeller: boolean;
  /** True when at least one offer is Prime-eligible (FBA or Seller-Fulfilled Prime). */
  isPrime: boolean;
  /** Total number of competing offers across ALL conditions. */
  offerCount: number;
  /** True when the requested condition has at least one offer for this product. */
  hasOffersInRequestedCondition: boolean;
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
    query?: Record<string, string | string[]>;
    body?: unknown;
  },
): Promise<T> {
  const env = getServerEnv();
  const [accessToken, awsCredentials] = await Promise.all([getLwaAccessToken(env), getAwsCredentials(env)]);
  const queryString = options?.query ? (() => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query!)) {
      if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
      else params.append(k, v);
    }
    return `?${params.toString()}`;
  })() : "";
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

export type ItemCondition = "new" | "used" | "refurbished" | "collectible";

function extractOffersBasics(payload: unknown, condition: ItemCondition = "new"): OffersBasics {
  const root = asObject(payload);
  const payloadObj = asObject(root?.payload);
  const summary = asObject(payloadObj?.Summary);
  const offers = asArray(payloadObj?.Offers);

  // SP-API may emit condition strings as "new" or "New" depending on field.
  const matchesCondition = (raw: unknown): boolean => {
    const c = readString(raw);
    return c != null && c.toLowerCase() === condition;
  };

  // Buy box: prefer the requested condition. If none in that condition,
  // fall back to ANY condition's buy box so the card still shows a price
  // (commonly a New buy box even when the user is browsing Used).
  let buyBoxPrice: number | null = null;
  const buyBoxPrices = asArray(summary?.BuyBoxPrices);
  for (const bbRaw of buyBoxPrices) {
    const bb = asObject(bbRaw);
    if (!matchesCondition(bb?.condition)) continue;
    const landed = asObject(bb?.LandedPrice);
    const amount = readNumber(landed?.Amount);
    if (amount !== null) { buyBoxPrice = amount; break; }
  }
  if (buyBoxPrice === null) {
    for (const bbRaw of buyBoxPrices) {
      const bb = asObject(bbRaw);
      const landed = asObject(bb?.LandedPrice);
      const amount = readNumber(landed?.Amount);
      if (amount !== null) { buyBoxPrice = amount; break; }
    }
  }

  // Lowest: absolute minimum across ALL conditions (matches Amazon's "from $X"
  // surface on the offers page). This is what makes the toggle visible — for
  // products with Used offers cheaper than the New buy box, Lowest < Buy Box.
  let lowestPrice: number | null = null;
  const lowestPrices = asArray(summary?.LowestPrices);
  for (const lpRaw of lowestPrices) {
    const lp = asObject(lpRaw);
    const lpLanded = asObject(lp?.LandedPrice);
    const amount = readNumber(lpLanded?.Amount);
    if (amount !== null && (lowestPrice === null || amount < lowestPrice)) {
      lowestPrice = amount;
    }
  }
  // Also scan individual offers (Summary.LowestPrices can be sparse).
  for (const offerRaw of offers) {
    const offer = asObject(offerRaw);
    const listingPrice = asObject(offer?.ListingPrice);
    const shipping = asObject(offer?.Shipping);
    const lp = readNumber(listingPrice?.Amount);
    const sh = readNumber(shipping?.Amount) ?? 0;
    if (lp !== null) {
      const landed = lp + sh;
      if (lowestPrice === null || landed < lowestPrice) lowestPrice = landed;
    }
  }

  // Invariant: lowest <= buyBox. Clamp if any inconsistency leaked through.
  if (buyBoxPrice !== null && lowestPrice !== null && lowestPrice > buyBoxPrice) {
    lowestPrice = buyBoxPrice;
  }
  // Null fallbacks: if only one is set, use it for the other.
  if (buyBoxPrice === null) buyBoxPrice = lowestPrice;
  if (lowestPrice === null) lowestPrice = buyBoxPrice;

  let amazonIsSeller = false;
  let isPrime = false;
  for (const offerRaw of offers) {
    const offer = asObject(offerRaw);
    const sellerId = readString(offer?.SellerId);
    if (sellerId === AMAZON_SELLER_ID) amazonIsSeller = true;
    const isFba = offer?.IsFulfilledByAmazon === true;
    const primeInfo = asObject(offer?.PrimeInformation);
    const primeFlag = primeInfo?.IsPrime === true;
    if (isFba || primeFlag) isPrime = true;
  }

  // Total offer count across ALL conditions (matches Amazon's "Other sellers" page).
  // Summary.NumberOfOffers is an array of { condition, fulfillmentChannel, OfferCount }.
  let offerCount = 0;
  let conditionOfferCount = 0;
  const numberOfOffers = asArray(summary?.NumberOfOffers);
  for (const noRaw of numberOfOffers) {
    const no = asObject(noRaw);
    const c = readNumber(no?.OfferCount);
    if (c !== null) {
      offerCount += c;
      if (matchesCondition(no?.condition)) conditionOfferCount += c;
    }
  }
  // Fallbacks if Summary.NumberOfOffers absent.
  if (offerCount === 0) {
    const total = readNumber(summary?.TotalOfferCount);
    if (total !== null && total > 0) offerCount = total;
    else offerCount = offers.length;
  }

  // Does the requested condition have any offers? Two signals: the
  // condition-specific NumberOfOffers count, or a non-empty Offers list
  // (the API filters that list to the requested ItemCondition).
  const hasOffersInRequestedCondition = conditionOfferCount > 0 || offers.length > 0;

  return {
    buyBoxPrice: roundCurrency(buyBoxPrice),
    lowestPrice: roundCurrency(lowestPrice),
    amazonIsSeller,
    isPrime,
    offerCount,
    hasOffersInRequestedCondition,
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

export async function fetchOffersForAsin(asin: string, condition: ItemCondition = "new"): Promise<OffersBasics> {
  // SP-API expects capitalised ItemCondition values ("New", "Used", ...).
  const itemCondition = condition.charAt(0).toUpperCase() + condition.slice(1);
  const offers = await spApiRequest<unknown>("GET", `/products/pricing/v0/items/${asin}/offers`, {
    query: {
      MarketplaceId: getServerEnv().marketplaceId,
      ItemCondition: itemCondition,
    },
  });

  return extractOffersBasics(offers, condition);
}

export async function fetchBatchBuyBoxPrices(asins: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  if (asins.length === 0) return priceMap;
  try {
    const env = getServerEnv();
    const response = await spApiRequest<unknown>("GET", "/products/pricing/v0/price", {
      query: {
        MarketplaceId: env.marketplaceId,
        ItemType: "Asin",
        Asins: asins,
      },
    });
    const root = asObject(response);
    console.log("[fetchBatchBuyBoxPrices] root keys:", root ? Object.keys(root) : null);
    const payload = asArray(root?.payload);
    console.log("[fetchBatchBuyBoxPrices] payload length:", payload.length);
    for (const entryRaw of payload) {
      const entry = asObject(entryRaw);
      const asin = readString(entry?.ASIN);
      if (!asin) continue;
      const product = asObject(asObject(entry?.Product));
      const competitive = asObject(asObject(product?.CompetitivePricing));
      const prices = asArray(competitive?.CompetitivePrices);
      for (const priceRaw of prices) {
        const p = asObject(priceRaw);
        if (readString(p?.CompetitivePriceId) !== "1") continue;
        const priceObj = asObject(p?.Price);
        const landed = asObject(priceObj?.LandedPrice);
        const listing = asObject(priceObj?.ListingPrice);
        const amount = readNumber(landed?.Amount) ?? readNumber(listing?.Amount);
        if (amount !== null) { priceMap.set(asin, amount); break; }
      }
    }
  } catch (err) {
    console.error("[fetchBatchBuyBoxPrices] error:", err instanceof Error ? err.message : err);
  }
  return priceMap;
}

export interface SpApiBuyerItem {
  asin: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  /** Buy Box price (Amazon's recommended seller price). May be null when no offers. */
  buyBoxPrice: number | null;
  /** Lowest landed price across all offers. May be lower than buy box. */
  lowestPrice: number | null;
  /** Convenience: the active "display" price the route applied (buy box or lowest). */
  price: number | null;
  salesRank: number | null;
  salesRankCategory: string | null;
  affiliateUrl: string | null;
  starRating: number | null;
  reviewCount: number | null;
  isPrime?: boolean;
  /** Number of competing sellers (offers) on the listing. */
  offerCount?: number;
  /** True when the requested ItemCondition has at least one offer for this product. */
  hasOffersInRequestedCondition?: boolean;
}

export async function searchBuyerCatalogSpApi(options: {
  keyword: string;
  maxResults?: number;
  pageToken?: string;
  brandNames?: string[];
  condition?: ItemCondition;
}): Promise<{ ok: true; data: { items: SpApiBuyerItem[]; nextToken?: string } } | { ok: false; error: string }> {
  const condition = options.condition ?? "new";
  const env = getServerEnv();
  const query: Record<string, string> = {
    marketplaceIds: env.marketplaceId,
    keywords: options.keyword,
    includedData: "summaries,images,salesRanks",
    pageSize: String(Math.min(Math.max(options.maxResults ?? 20, 1), 20)),
  };
  if (options.pageToken) query.pageToken = options.pageToken;
  if (options.brandNames && options.brandNames.length > 0) {
    query.brandNames = options.brandNames.join(",");
  }

  try {
    const response = await spApiRequest<unknown>("GET", "/catalog/2022-04-01/items", { query });
    const root = asObject(response);
    const items = asArray(root?.items);
    const nextToken = readString(root?.nextToken) ?? undefined;

    const mapped: SpApiBuyerItem[] = items.map((raw) => {
      const item = asObject(raw);
      const asin = readString(item?.asin) ?? "";

      const summaries = asArray(item?.summaries);
      const summary = asObject(summaries[0]);
      const title = readString(summary?.itemName) ?? readString(summary?.itemClassificationName) ?? "";
      const brand = readString(summary?.brandName) ?? "";

      const imageGroups = asArray(item?.images);
      let imageUrl: string | null = null;
      for (const groupRaw of imageGroups) {
        const group = asObject(groupRaw);
        const images = asArray(group?.images);
        for (const imgRaw of images) {
          const img = asObject(imgRaw);
          if (readString(img?.variant) === "MAIN") {
            imageUrl = readString(img?.link);
            break;
          }
        }
        if (imageUrl) break;
      }

      const salesRanks = asArray(item?.salesRanks);
      let salesRank: number | null = null;
      let salesRankCategory: string | null = null;
      for (const sgRaw of salesRanks) {
        const sg = asObject(sgRaw);
        const classRanks = asArray(sg?.classificationRanks);
        const dispRanks = asArray(sg?.displayGroupRanks);
        const merged = classRanks.length > 0 ? classRanks : dispRanks;
        for (const rankRaw of merged) {
          const rankObj = asObject(rankRaw);
          const rank = readNumber(rankObj?.rank);
          if (rank !== null) {
            salesRank = rank;
            salesRankCategory = readString(rankObj?.title) ?? readString(rankObj?.displayName) ?? null;
            break;
          }
        }
        if (salesRank !== null) break;
      }

      const partnerTag = process.env.PA_API_PARTNER_TAG ?? "";
      const affiliateUrl = `https://www.amazon.com/dp/${asin}${partnerTag ? `?tag=${partnerTag}` : ""}`;

      return {
        asin,
        title,
        brand,
        imageUrl,
        buyBoxPrice: null,
        lowestPrice: null,
        price: null,
        salesRank,
        salesRankCategory,
        affiliateUrl,
        starRating: null,
        reviewCount: null,
      } as SpApiBuyerItem;
    }).filter((i) => i.asin !== "");

    // Fetch offers with bounded concurrency (avoid hammering SP-API and triggering 429s).
    const concurrency = 8;
    const offers: Array<OffersBasics | null> = new Array(mapped.length).fill(null);
    let nextIdx = 0;
    async function offerWorker(): Promise<void> {
      while (nextIdx < mapped.length) {
        const i = nextIdx;
        nextIdx += 1;
        try {
          offers[i] = await fetchOffersForAsin(mapped[i].asin, condition);
        } catch {
          offers[i] = null;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, mapped.length) }, () => offerWorker()),
    );
    const withPrices: SpApiBuyerItem[] = mapped.map((item, idx) => {
      const o = offers[idx];
      const buyBoxPrice = o?.buyBoxPrice ?? null;
      const lowestPrice = o?.lowestPrice ?? null;
      return {
        ...item,
        buyBoxPrice,
        lowestPrice,
        price: buyBoxPrice ?? lowestPrice,
        isPrime: o?.isPrime ?? false,
        offerCount: o?.offerCount ?? 0,
        hasOffersInRequestedCondition: o?.hasOffersInRequestedCondition ?? false,
      };
    });

    return { ok: true, data: { items: withPrices, nextToken } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "SP-API catalog search failed" };
  }
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
