/**
 * GET /api/catalog/search
 * Catalog browsing via SP-API only. PA-API is reserved for buyer mode.
 */

import { NextRequest, NextResponse } from "next/server";
import { userCatalogSearchLimit } from "@/lib/apiRateLimit";
import {
  getSpApiClientForUserOrGlobal,
  hasConnectedAmazonAccount,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { isBillingDisabled, isTestingBillingPass, loadBillingUser } from "@/lib/billing/access";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import type { CatalogItem } from "@/lib/spApiClient";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

const CATALOG_UNAVAILABLE = "Catalog temporarily unavailable. Please try again shortly.";

/** True only if the query looks like a real ASIN (10 alphanumeric with both letter and digit). */
function isAsinQuery(q: string): boolean {
  if (!/^[A-Z0-9]{10}$/i.test(q)) return false;
  return /[A-Z]/i.test(q) && /\d/.test(q);
}

function maxCatalogPageSize(): number {
  const n = Number(process.env.CATALOG_SEARCH_MAX_PAGE_SIZE ?? 60);
  return Number.isFinite(n) && n >= 10 && n <= 100 ? Math.floor(n) : 60;
}

async function searchCatalogViaSpApi(
  userId: string,
  q: string,
  size: number,
  pageToken: string | null,
): Promise<
  | { ok: true; items: CatalogItem[]; nextPageToken: string | null }
  | { ok: false; error: string; status: number }
> {
  const client = await getSpApiClientForUserOrGlobal(userId);
  if (!client) {
    return {
      ok: false,
      error: SP_API_UNAVAILABLE_USER_MESSAGE,
      status: 503,
    };
  }

  if (isAsinQuery(q)) {
    const item = await client.fetchCatalogItem(q.toUpperCase());
    return { ok: true, items: item ? [item] : [], nextPageToken: null };
  }

  const { items, nextPageToken } = await client.searchCatalogByKeywordPage(q, pageToken, size);
  return { ok: true, items, nextPageToken };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category")?.trim() || null;
  const subcategory = searchParams.get("subcategory")?.trim() || null;
  const keywordParam = searchParams.get("keyword")?.trim() || null;
  const legacyQ = searchParams.get("q")?.trim();

  const parts: string[] = [];
  if (category) parts.push(category);
  if (subcategory) parts.push(subcategory);
  if (keywordParam) parts.push(keywordParam);
  const q = parts.length > 0 ? parts.join(" ") : legacyQ?.trim();
  if (!q) {
    return NextResponse.json({ items: [], nextPageToken: null });
  }

  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  if (!isBillingDisabled() && !isTestingBillingPass()) {
    const billingUser = await loadBillingUser(gate.userId);
    const isPaid =
      billingUser &&
      (isAppOwnerEmail(billingUser.email) ||
        billingUser.subscriptionStatus === "active" ||
        billingUser.subscriptionStatus === "trialing");
    if (!isPaid && !(await hasConnectedAmazonAccount(gate.userId))) {
      return NextResponse.json(
        {
          error: "Connect your Amazon seller account to access the catalog.",
          code: "AMAZON_CONNECT_REQUIRED",
          items: [],
          nextPageToken: null,
        },
        { status: 403 },
      );
    }
  }

  if (!(await userCatalogSearchLimit(gate.userId))) {
    return NextResponse.json(
      { error: "Too many catalog searches. Wait a minute and try again.", items: [], nextPageToken: null },
      { status: 429 },
    );
  }
  const usage = await consumeMonthlyUsage(gate.userId, "catalog_search");
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: "Monthly catalog-search limit reached for your plan.",
        code: "USAGE_LIMIT",
        metric: usage.metric,
        period: usage.periodKey,
        used: usage.used,
        limit: usage.limit,
        items: [],
        nextPageToken: null,
      },
      { status: 429 },
    );
  }

  const rawPageSize = searchParams.get("pageSize");
  const requested = rawPageSize ? Math.min(500, Math.max(1, parseInt(rawPageSize, 10))) : 30;
  const size = Number.isFinite(requested) ? Math.min(requested, maxCatalogPageSize()) : Math.min(30, maxCatalogPageSize());

  const pageToken = searchParams.get("pageToken")?.trim() || null;

  try {
    const result = await searchCatalogViaSpApi(gate.userId, q, size, pageToken);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, items: [], nextPageToken: null },
        { status: result.status },
      );
    }

    return NextResponse.json({ items: result.items, nextPageToken: result.nextPageToken ?? null });
  } catch (e) {
    console.error("Catalog search error:", e);
    return NextResponse.json(
      { error: CATALOG_UNAVAILABLE, items: [], nextPageToken: null },
      { status: 503 },
    );
  }
}
