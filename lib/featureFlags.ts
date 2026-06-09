import { prisma } from "@/lib/db";

const FLAG_DEFAULTS: Record<string, boolean> = {
  "ff:pa_api_catalog": false,
};

/** Reads a boolean SystemConfig flag; uses FLAG_DEFAULTS when unset. */
export async function getSystemConfigFlag(key: string, defaultValue = true): Promise<boolean> {
  const resolvedDefault = FLAG_DEFAULTS[key] ?? defaultValue;
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key } });
    if (!row) return resolvedDefault;
    return row.value === "true";
  } catch {
    return resolvedDefault;
  }
}

/** When true, catalog browse/keyword search uses PA-API (Creators API). When false, uses SP-API. */
export async function isPaApiCatalogEnabled(): Promise<boolean> {
  return getSystemConfigFlag("ff:pa_api_catalog", false);
}

/** When true, buyer mode is fully active: buyer card on pricing, mode toggle in sidebar, /buyer page live. Default: false. */
export async function isBuyerModeEnabled(): Promise<boolean> {
  return getSystemConfigFlag("ff:buyer_mode", false);
}

/** When true, Keepa API integration is active (price history chart on product detail). Default: false. */
export async function isKeepaEnabled(): Promise<boolean> {
  return getSystemConfigFlag("ff:keepa", false);
}
