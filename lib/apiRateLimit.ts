/**
 * In-memory sliding-window rate limits per user (per server instance).
 * For horizontal scale, replace with Redis / Upstash later.
 */

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

const WINDOW_MS = 60_000;

export function userCatalogSearchLimit(userId: string): boolean {
  return rateLimitAllow(`catalog_search:${userId}`, rateLimitCatalogSearchPerMinute(), WINDOW_MS);
}

export function userAnalyzeLimit(userId: string): boolean {
  return rateLimitAllow(`analyze:${userId}`, rateLimitAnalyzePerMinute(), WINDOW_MS);
}

export function userRestrictionsLimit(userId: string): boolean {
  return rateLimitAllow(`restrictions:${userId}`, rateLimitRestrictionsPerMinute(), WINDOW_MS);
}

export function userKeywordSearchLimit(userId: string): boolean {
  return rateLimitAllow(`keyword_search:${userId}`, rateLimitKeywordSearchPerMinute(), WINDOW_MS);
}

export function userUploadLimit(userId: string): boolean {
  return rateLimitAllow(`upload:${userId}`, rateLimitUploadPerMinute(), WINDOW_MS);
}
