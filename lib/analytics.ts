declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-XXGCLYR7K3";

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", eventName, params);
}

// ── Feature usage ────────────────────────────────────────────────────────────

export function trackProductSearch(params: {
  identifier: string;
  lookup_only?: boolean;
}): void {
  trackEvent("product_search", params);
}

export function trackProductDetailView(params: {
  asin: string | undefined;
  decision: string | undefined;
}): void {
  trackEvent("product_detail_view", params);
}

export function trackKeywordSearch(params: {
  keyword: string;
  result_count: number;
}): void {
  trackEvent("keyword_search", params);
}

export function trackBulkUploadStart(params: {
  file_name: string;
  seller_type: string;
}): void {
  trackEvent("bulk_upload_start", params);
}

export function trackBulkUploadComplete(params: {
  analyzed_rows: number;
  valid_rows: number;
  total_rows: number;
}): void {
  trackEvent("bulk_upload_complete", params);
}

export function trackBarcodeScanOpen(): void {
  trackEvent("barcode_scan_open");
}

export function trackAiInsightView(params: { asin: string | undefined }): void {
  trackEvent("ai_insight_view", params);
}

export function trackProductSaved(params: { asin: string | undefined }): void {
  trackEvent("product_saved", params);
}

// ── Conversion funnel ────────────────────────────────────────────────────────

export function trackSignupComplete(params: { plan: string }): void {
  trackEvent("sign_up", { method: params.plan });
}

export function trackSubscriptionPurchase(params: {
  plan: string;
  currency?: string;
  value?: number;
}): void {
  trackEvent("purchase", {
    currency: params.currency ?? "USD",
    value: params.value,
    items: params.plan,
  });
}

export function trackCheckoutStart(params: { plan: string }): void {
  trackEvent("begin_checkout", { plan: params.plan });
}

export function trackBillingPageView(params: { source: string }): void {
  trackEvent("billing_page_view", params);
}

// ── Amazon connect ────────────────────────────────────────────────────────────

export function trackAmazonConnectStart(): void {
  trackEvent("amazon_connect_start");
}

export function trackAmazonConnectComplete(): void {
  trackEvent("amazon_connect_complete");
}

// ── Errors ───────────────────────────────────────────────────────────────────

export function trackError(params: {
  error_type: string;
  error_message?: string;
  context?: string;
}): void {
  trackEvent("app_error", params);
}
