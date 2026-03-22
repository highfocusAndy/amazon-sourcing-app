/**
 * Optional PA-API 5.0 client to fetch the main product-page BSR (WebsiteSalesRank).
 * Requires PA_API_ACCESS_KEY, PA_API_SECRET_KEY, PA_API_PARTNER_TAG in env.
 * If not set or request fails, callers should fall back to SP-API catalog rank.
 */

import aws4 from "aws4";

const PA_API_GET_ITEMS_TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";

const MARKETPLACE_TO_PA_HOST_REGION: Record<string, { host: string; region: string }> = {
  ATVPDKIKX0DER: { host: "webservices.amazon.com", region: "us-east-1" },
  A2EUQ1WTGCTBG2: { host: "webservices.amazon.ca", region: "us-east-1" },
  A1AM78C64UM0Y8: { host: "webservices.amazon.com.mx", region: "us-east-1" },
  A2Q3Y263D00KWC: { host: "webservices.amazon.com.br", region: "us-east-1" },
  A1F83G8C2RGOOP: { host: "webservices.amazon.co.uk", region: "eu-west-1" },
  A13V1IB3VIYZZH: { host: "webservices.amazon.fr", region: "eu-west-1" },
  A1PA6795UKMFR9: { host: "webservices.amazon.de", region: "eu-west-1" },
  APJ6JRA9NG5V4: { host: "webservices.amazon.it", region: "eu-west-1" },
  A1RKKUPIHCS9HS: { host: "webservices.amazon.es", region: "eu-west-1" },
  A1805IZSGTT6HS: { host: "webservices.amazon.nl", region: "eu-west-1" },
  A1C3ZFZOHQY46M: { host: "webservices.amazon.pl", region: "eu-west-1" },
  A17E79C6D8DWNP: { host: "webservices.amazon.sa", region: "eu-west-1" },
  A21TJRUUN4KGV: { host: "webservices.amazon.in", region: "eu-west-1" },
  A33AVAJ2PDY3EV: { host: "webservices.amazon.tr", region: "eu-west-1" },
  A2VIGQ35RCS4UG: { host: "webservices.amazon.ae", region: "eu-west-1" },
  A21T2K0T0K0K0K: { host: "webservices.amazon.se", region: "eu-west-1" },
  A1VC38T7YXB528: { host: "webservices.amazon.co.jp", region: "us-west-2" },
  A19VAU5U5O7RUS: { host: "webservices.amazon.sg", region: "us-west-2" },
  A39IBJ37TRP1C6: { host: "webservices.amazon.com.au", region: "us-west-2" },
};

export interface PaApiMainBsrResult {
  salesRank: number;
  categoryName: string | null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isPaApiConfigured(): boolean {
  const key = process.env.PA_API_ACCESS_KEY?.trim();
  const secret = process.env.PA_API_SECRET_KEY?.trim();
  const tag = process.env.PA_API_PARTNER_TAG?.trim();
  return Boolean(key && secret && tag);
}

function getPaApiConfig(): {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  host: string;
  region: string;
} {
  const accessKey = process.env.PA_API_ACCESS_KEY?.trim();
  const secretKey = process.env.PA_API_SECRET_KEY?.trim();
  const partnerTag = process.env.PA_API_PARTNER_TAG?.trim();
  if (!accessKey || !secretKey || !partnerTag) {
    throw new Error("PA-API credentials missing: set PA_API_ACCESS_KEY, PA_API_SECRET_KEY, PA_API_PARTNER_TAG");
  }
  const marketplaceId = (process.env.MARKETPLACE_ID ?? process.env.SP_API_MARKETPLACE_ID ?? "ATVPDKIKX0DER").trim().toUpperCase();
  const { host, region } = MARKETPLACE_TO_PA_HOST_REGION[marketplaceId] ?? {
    host: "webservices.amazon.com",
    region: "us-east-1",
  };
  return { accessKey, secretKey, partnerTag, host, region };
}

function parseGetItemsResponse(json: unknown): PaApiMainBsrResult | null {
  const root = asObject(json);
  const itemsResult = asObject(root?.ItemsResult);
  const items = Array.isArray(itemsResult?.Items) ? itemsResult.Items : [];
  const first = asObject(items[0]);
  if (!first) return null;

  const browseNodeInfo = asObject(first.BrowseNodeInfo);
  if (!browseNodeInfo) return null;

  const websiteSalesRank = asObject(browseNodeInfo.WebsiteSalesRank);
  if (!websiteSalesRank) return null;

  const rank = readNumber(websiteSalesRank.SalesRank);
  if (rank === null || rank < 1) return null;

  const displayName = readString(websiteSalesRank.DisplayName) ?? readString(websiteSalesRank.ContextFreeName);
  return {
    salesRank: rank,
    categoryName: displayName,
  };
}

/**
 * Fetch the main product-page BSR (WebsiteSalesRank) and its category for an ASIN.
 * Returns null if PA-API is not configured, or the request fails, or the item has no WebsiteSalesRank.
 */
export async function fetchMainBsr(asin: string): Promise<PaApiMainBsrResult | null> {
  if (!isPaApiConfigured()) return null;
  const normalizedAsin = asin.trim().toUpperCase();
  if (!normalizedAsin || normalizedAsin.length !== 10) return null;

  const { accessKey, secretKey, partnerTag, host, region } = getPaApiConfig();
  const body = JSON.stringify({
    ItemIds: [normalizedAsin],
    ItemIdType: "ASIN",
    Marketplace: host === "webservices.amazon.com" ? "www.amazon.com" : undefined,
    PartnerTag: partnerTag,
    PartnerType: "Associates",
    Resources: ["BrowseNodeInfo.WebsiteSalesRank", "BrowseNodeInfo.BrowseNodes.SalesRank"],
  });

  const path = "/";
  const signed = aws4.sign(
    {
      service: "ProductAdvertisingAPIv1",
      region,
      host,
      method: "POST",
      path,
      headers: {
        host,
        "content-type": "application/json; charset=utf-8",
        "content-encoding": "amz-1.0",
        "x-amz-target": PA_API_GET_ITEMS_TARGET,
      },
      body,
    },
    {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    }
  );

  const response = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: signed.headers as Record<string, string>,
    body,
    cache: "no-store",
  });

  const raw = await response.text();
  let json: unknown = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const errors = (json as Record<string, unknown>).Errors;
  if (Array.isArray(errors) && errors.length > 0) return null;

  return parseGetItemsResponse(json);
}
