/**
 * Rate limits per user.
 *
 * - Default: in-memory sliding window (one Node process only).
 * - Production / multi-instance: set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 *   (Upstash Redis REST) so limits are shared across all app instances.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Timestamps = number[];

const buckets = new Map<string, Timestamps>();

function prune(now: number, stamps: Timestamps, windowMs: number): Timestamps {
  return stamps.filter((t) => now - t < windowMs);
}

export function rateLimitAllow(key: string, maxPerWindow: number, windowMs: number): boolean {
  const now = Date.now();
  const list = prune(now, buckets.get(key) ?? [], windowMs);
  if (list.length >= maxPerWindow) {
    buckets.set(key, list);
    return false;
  }
  list.push(now);
  buckets.set(key, list);
  return true;
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function rateLimitCatalogSearchPerMinute(): number {
  return intEnv("RATE_LIMIT_CATALOG_SEARCH_PER_MIN", 45);
}

export function rateLimitAnalyzePerMinute(): number {
  return intEnv("RATE_LIMIT_ANALYZE_PER_MIN", 30);
}

export function rateLimitRestrictionsPerMinute(): number {
  return intEnv("RATE_LIMIT_RESTRICTIONS_PER_MIN", 420);
}

export function rateLimitKeywordSearchPerMinute(): number {
  return intEnv("RATE_LIMIT_KEYWORD_SEARCH_PER_MIN", 40);
}

export function rateLimitUploadPerMinute(): number {
  return intEnv("RATE_LIMIT_UPLOAD_PER_MIN", 12);
}

export function rateLimitOpenaiInsightPerMinute(): number {
  return intEnv("RATE_LIMIT_OPENAI_INSIGHT_PER_MIN", 30);
}

export function rateLimitOpenaiChatPerMinute(): number {
  return intEnv("RATE_LIMIT_OPENAI_CHAT_PER_MIN", 20);
}

const WINDOW_MS = 60_000;

/** True when Upstash env is present (shared limits across server instances). */
export function useDistributedRateLimit(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton !== undefined) return redisSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisSingleton = null;
    return null;
  }
  redisSingleton = new Redis({ url, token });
  return redisSingleton;
}

const ratelimitByKey = new Map<string, Ratelimit>();

function slidingRatelimit(cacheKey: string, maxPerMinute: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const mapKey = `${cacheKey}:${maxPerMinute}`;
  let rl = ratelimitByKey.get(mapKey);
  if (rl) return rl;
  rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxPerMinute, "60 s"),
    prefix: `@upstash/ratelimit/${cacheKey}`,
  });
  ratelimitByKey.set(mapKey, rl);
  return rl;
}

async function allowSlidingWindow(
  cacheKey: string,
  maxPerMinute: number,
  memoryKey: string,
  userId: string,
): Promise<boolean> {
  const rl = slidingRatelimit(cacheKey, maxPerMinute);
  if (!rl) {
    return rateLimitAllow(memoryKey, maxPerMinute, WINDOW_MS);
  }
  const { success } = await rl.limit(userId);
  return success;
}

export async function userCatalogSearchLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow(
    "catalog_search",
    rateLimitCatalogSearchPerMinute(),
    `catalog_search:${userId}`,
    userId,
  );
}

export async function userAnalyzeLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow("analyze", rateLimitAnalyzePerMinute(), `analyze:${userId}`, userId);
}

export async function userRestrictionsLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow(
    "restrictions",
    rateLimitRestrictionsPerMinute(),
    `restrictions:${userId}`,
    userId,
  );
}

export async function userKeywordSearchLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow(
    "keyword_search",
    rateLimitKeywordSearchPerMinute(),
    `keyword_search:${userId}`,
    userId,
  );
}

export async function userBuyerSearchLimit(userId: string): Promise<boolean> {
  // Buyer catalog pages are cached, so actual PA-API calls are rare.
  // 60 requests/min (1/sec) is generous for scroll-based pagination.
  return allowSlidingWindow("buyer_search", 60, `buyer_search:${userId}`, userId);
}

export async function userUploadLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow("upload", rateLimitUploadPerMinute(), `upload:${userId}`, userId);
}

export async function userOpenaiInsightLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow(
    "openai_insight",
    rateLimitOpenaiInsightPerMinute(),
    `openai_insight:${userId}`,
    userId,
  );
}

export async function userOpenaiChatLimit(userId: string): Promise<boolean> {
  return allowSlidingWindow(
    "openai_chat",
    rateLimitOpenaiChatPerMinute(),
    `openai_chat:${userId}`,
    userId,
  );
}
