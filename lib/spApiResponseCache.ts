import { createHash } from "crypto";

import { prisma } from "@/lib/db";
import type { CatalogItem } from "@/lib/spApiClient";
import type { ProductAnalysis } from "@/lib/types";

function numEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function catalogSearchTtlSec(): number {
  return numEnv("SP_API_CACHE_CATALOG_SEARCH_TTL_SEC", 600);
}

export function catalogItemTtlSec(): number {
  return numEnv("SP_API_CACHE_CATALOG_ITEM_TTL_SEC", 3600);
}

export function keywordSearchTtlSec(): number {
  return numEnv("SP_API_CACHE_KEYWORD_SEARCH_TTL_SEC", 600);
}

export function analysisResultTtlSec(): number {
  return numEnv("SP_API_CACHE_ANALYSIS_TTL_SEC", 600);
}

export function listingRestrictionsTtlSec(): number {
  return numEnv("SP_API_CACHE_RESTRICTIONS_TTL_SEC", 900);
}

export function catalogSearchCacheKey(
  marketplaceId: string,
  q: string,
  pageToken: string | null,
  pageSize: number,
): string {
  const raw = `${marketplaceId}\n${q.trim().toLowerCase()}\n${pageToken ?? ""}\n${pageSize}`;
  return `cs:${createHash("sha256").update(raw).digest("hex")}`;
}

export function catalogItemCacheKey(marketplaceId: string, asin: string): string {
  return `ci:${marketplaceId}:${asin.trim().toUpperCase()}`;
}

export function keywordSearchCacheKey(marketplaceId: string, q: string, maxResults: number): string {
  const raw = `${marketplaceId}\n${q.trim().toLowerCase()}\n${maxResults}`;
  return `ks:${createHash("sha256").update(raw).digest("hex")}`;
}

export function analysisCacheKey(
  marketplaceId: string,
  sellerId: string,
  input: {
    identifier: string;
    wholesalePrice: number;
    brand: string;
    projectedMonthlyUnits: number;
    sellerType: string;
    shippingCost: number;
  },
): string {
  const raw = JSON.stringify({
    mp: marketplaceId,
    s: sellerId,
    id: input.identifier.trim().toUpperCase(),
    w: Math.round(input.wholesalePrice * 10_000) / 10_000,
    b: input.brand.trim().toLowerCase(),
    u: input.projectedMonthlyUnits,
    t: input.sellerType,
    sh: Math.round(input.shippingCost * 10_000) / 10_000,
  });
  return `an:${createHash("sha256").update(raw).digest("hex")}`;
}

export function listingRestrictionsCacheKey(marketplaceId: string, sellerId: string, asin: string): string {
  return `lr:${marketplaceId}:${sellerId}:${asin.trim().toUpperCase()}`;
}

type ApiResponseCacheDelegate = {
  findUnique: (args: { where: { cacheKey: string } }) => Promise<{
    payload: string;
    expiresAt: Date;
  } | null>;
  delete: (args: { where: { cacheKey: string } }) => Promise<unknown>;
  upsert: (args: {
    where: { cacheKey: string };
    create: { cacheKey: string; payload: string; expiresAt: Date };
    update: { payload: string; expiresAt: Date };
  }) => Promise<unknown>;
};

function getApiResponseCacheTable(): ApiResponseCacheDelegate | null {
  const table = (prisma as unknown as { apiResponseCache?: ApiResponseCacheDelegate }).apiResponseCache;
  return table && typeof table.findUnique === "function" ? table : null;
}

async function getPayload<T>(cacheKey: string): Promise<T | null> {
  const cache = getApiResponseCacheTable();
  if (!cache) return null;
  const row = await cache.findUnique({
    where: { cacheKey },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    void cache.delete({ where: { cacheKey } }).catch(() => {});
    return null;
  }
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

async function setPayload(cacheKey: string, value: unknown, ttlSec: number): Promise<void> {
  const cache = getApiResponseCacheTable();
  if (!cache) return;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  const payload = JSON.stringify(value);
  await cache.upsert({
    where: { cacheKey },
    create: { cacheKey, payload, expiresAt },
    update: { payload, expiresAt },
  });
}

export async function getCatalogSearchPageCache(
  marketplaceId: string,
  q: string,
  pageToken: string | null,
  pageSize: number,
): Promise<{ items: CatalogItem[]; nextPageToken: string | null } | null> {
  const key = catalogSearchCacheKey(marketplaceId, q, pageToken, pageSize);
  return getPayload(key);
}

export async function setCatalogSearchPageCache(
  marketplaceId: string,
  q: string,
  pageToken: string | null,
  pageSize: number,
  data: { items: CatalogItem[]; nextPageToken: string | null },
): Promise<void> {
  const key = catalogSearchCacheKey(marketplaceId, q, pageToken, pageSize);
  await setPayload(key, data, catalogSearchTtlSec());
}

export async function getCatalogItemCache(marketplaceId: string, asin: string): Promise<CatalogItem | null> {
  const key = catalogItemCacheKey(marketplaceId, asin);
  const row = await getPayload<CatalogItem>(key);
  return row && row.asin ? row : null;
}

export async function setCatalogItemCache(marketplaceId: string, asin: string, item: CatalogItem): Promise<void> {
  const key = catalogItemCacheKey(marketplaceId, asin);
  await setPayload(key, item, catalogItemTtlSec());
}

export async function getKeywordSearchCache(
  marketplaceId: string,
  q: string,
  maxResults: number,
): Promise<ProductAnalysis[] | null> {
  const key = keywordSearchCacheKey(marketplaceId, q, maxResults);
  return getPayload<ProductAnalysis[]>(key);
}

export async function setKeywordSearchCache(
  marketplaceId: string,
  q: string,
  maxResults: number,
  results: ProductAnalysis[],
): Promise<void> {
  const key = keywordSearchCacheKey(marketplaceId, q, maxResults);
  await setPayload(key, results, keywordSearchTtlSec());
}

export async function getAnalysisResultCache(cacheKey: string): Promise<ProductAnalysis | null> {
  return getPayload<ProductAnalysis>(cacheKey);
}

export async function setAnalysisResultCache(cacheKey: string, result: ProductAnalysis): Promise<void> {
  await setPayload(cacheKey, result, analysisResultTtlSec());
}

export async function getListingRestrictionsCachePayload(cacheKey: string): Promise<{
  asin: string;
  gated: boolean;
  approvalRequired: boolean;
  listingRestricted: boolean;
} | null> {
  return getPayload(cacheKey);
}

export async function setListingRestrictionsCachePayload(
  cacheKey: string,
  body: { asin: string; gated: boolean; approvalRequired: boolean; listingRestricted: boolean },
): Promise<void> {
  await setPayload(cacheKey, body, listingRestrictionsTtlSec());
}
