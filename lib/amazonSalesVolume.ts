/**
 * Extract the "X+ bought in past month" / "Product sells X+" label from the
 * Amazon product page. Amazon shows this on the page but does not expose it
 * via any API. Server-side fetches are often blocked by Amazon (captcha/minimal
 * HTML), so extraction may fail; when it works, we show it as "Product sells".
 * Set EXTRACT_AMAZON_SALES_VOLUME=false to disable.
 */

const MARKETPLACE_DOMAINS: Record<string, string> = {
  ATVPDKIKX0DER: "amazon.com",
  A1F83G8C2ARO7P: "amazon.co.uk",
  A1PA6795UKMFR9: "amazon.de",
  A13V1IB3VIYZZH: "amazon.fr",
  A1C3SOZRARQ6R3: "amazon.es",
  APJ6JRA9NG5M4: "amazon.it",
  A2NODKZ7P85S9: "amazon.ca",
  A21TJRUUN4KGV: "amazon.in",
  A19VAU5U5O7RUS: "amazon.com.mx",
  A2Q3Y263D00KWC: "amazon.com.br",
};

function getDomain(marketplaceId: string): string {
  return MARKETPLACE_DOMAINS[marketplaceId] ?? "amazon.com";
}

/** Regexes to find sales volume text (e.g. "1K+", "500+", "10K+ bought in past month"). */
const PATTERNS: RegExp[] = [
  // "1K+ bought in past month" or "500+ bought in past month"
  /(\d+(?:\.\d+)?[KkMm]?\+?)\s*bought\s*in\s*past\s*month/i,
  // "bought in past month" with number before it (capture number)
  /(\d+(?:\.\d+)?[KkMm]?\+?)\s*.*?bought\s*in\s*past\s*month/i,
  // "Product sells 1K+" or "sells 2K+"
  /sells?\s*(\d+(?:\.\d+)?[KkMm]?\+?)/i,
  // "X+ bought" anywhere
  /(\d+(?:\.\d+)?[KkMm]?\+?)\s*bought/i,
  // JSON-like: "salesVolume":"1K+" or 'boughtInPastMonth':"500+"
  /(?:salesVolume|boughtInPastMonth|unitsSold|salesVolumeLabel)["']?\s*:\s*["']?(\d+(?:\.\d+)?[KkMm]?\+?)/i,
];

/** Amazon often returns a block/captcha page instead of product content. */
function isBlockOrCaptchaPage(html: string): boolean {
  const lower = html.toLowerCase();
  if (html.length < 5000) return true;
  if (/continue\s+shopping|robot|captcha|blocked|automated/i.test(lower)) return true;
  if (!/bought|product|price|add to cart|asin/i.test(lower)) return true;
  return false;
}

function extractFromHtml(html: string): string | null {
  if (isBlockOrCaptchaPage(html)) return null;
  const normalized = html.replace(/\s+/g, " ");
  for (const re of PATTERNS) {
    const m = normalized.match(re);
    if (m && m[1]) {
      const value = m[1].trim();
      if (value.length <= 20) return value;
    }
  }
  return null;
}

export function getMarketplaceDomain(marketplaceId: string): string {
  return getDomain(marketplaceId);
}

/**
 * Fetch the product page and extract the sales volume label (e.g. "1K+", "500+").
 * Returns null if disabled, fetch fails, or no match. Does not throw.
 */
export async function extractAmazonSalesVolume(
  asin: string,
  marketplaceId: string
): Promise<string | null> {
  if (process.env.EXTRACT_AMAZON_SALES_VOLUME === "false") {
    return null;
  }
  if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
    return null;
  }
  const domain = getDomain(marketplaceId);
  const url = `https://www.${domain}/dp/${asin}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractFromHtml(html);
  } catch {
    return null;
  }
}
