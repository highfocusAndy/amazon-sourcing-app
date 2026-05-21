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
