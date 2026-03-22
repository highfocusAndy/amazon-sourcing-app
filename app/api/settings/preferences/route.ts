import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

import { isAllowedMarketplaceId } from "@/lib/marketplaces";

const DEFAULTS = {
  defaultSellerType: "FBA" as const,
  defaultShippingCostFbm: 0,
  catalogPageSize: 30,
  marketplaceId: null as string | null,
} as const;

const CATALOG_PAGE_SIZE_MIN = 10;
const CATALOG_PAGE_SIZE_MAX = 100;

function getEnvMarketplaceId(): string {
  return (
    process.env.MARKETPLACE_ID?.trim() ||
    process.env.SP_API_MARKETPLACE_ID?.trim() ||
    "ATVPDKIKX0DER"
  );
}

export type PreferencesPayload = {
  default_seller_type?: "FBA" | "FBM";
  default_shipping_cost_fbm?: number;
  catalog_page_size?: number;
  marketplace_id?: string | null;
};

/** GET: return current user's preferences (or defaults). */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const defaults = {
    default_seller_type: DEFAULTS.defaultSellerType,
    default_shipping_cost_fbm: DEFAULTS.defaultShippingCostFbm,
    catalog_page_size: DEFAULTS.catalogPageSize,
    marketplace_id: getEnvMarketplaceId(),
  };

  const repo = (prisma as { userPreferences?: { findUnique: (args: unknown) => Promise<unknown> } }).userPreferences;
  if (typeof repo?.findUnique !== "function") {
    return NextResponse.json(defaults);
  }

  try {
    const row = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
    });

    if (!row) {
      return NextResponse.json(defaults);
    }

    return NextResponse.json({
      default_seller_type: row.defaultSellerType as "FBA" | "FBM",
      default_shipping_cost_fbm: row.defaultShippingCostFbm,
      catalog_page_size: Math.min(
        CATALOG_PAGE_SIZE_MAX,
        Math.max(CATALOG_PAGE_SIZE_MIN, row.catalogPageSize)
      ),
      marketplace_id: row.marketplaceId ?? getEnvMarketplaceId(),
    });
  } catch {
    return NextResponse.json(defaults);
  }
}

/** POST: update preferences. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repo = (prisma as { userPreferences?: { upsert: unknown } }).userPreferences;
  if (typeof repo?.upsert !== "function") {
    return NextResponse.json(
      { error: "Settings database not ready. Run: npx prisma generate and apply migrations, then restart." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as PreferencesPayload;

    const existing = await prisma.userPreferences.findUnique({
      where: { userId: session.user.id },
    });

    const defaultSellerType =
      body.default_seller_type !== undefined
        ? (body.default_seller_type === "FBM" ? "FBM" : "FBA")
        : (existing?.defaultSellerType ?? DEFAULTS.defaultSellerType);
    const defaultShippingCostFbm =
      body.default_shipping_cost_fbm !== undefined
        ? Math.max(0, Math.min(9999, Number(body.default_shipping_cost_fbm) ?? 0))
        : (existing?.defaultShippingCostFbm ?? DEFAULTS.defaultShippingCostFbm);
    const catalogPageSize =
      body.catalog_page_size !== undefined
        ? Math.max(CATALOG_PAGE_SIZE_MIN, Math.min(CATALOG_PAGE_SIZE_MAX, Math.round(Number(body.catalog_page_size) || 30)))
        : (existing ? Math.min(CATALOG_PAGE_SIZE_MAX, Math.max(CATALOG_PAGE_SIZE_MIN, existing.catalogPageSize)) : DEFAULTS.catalogPageSize);
    const marketplaceId =
      body.marketplace_id !== undefined
        ? (isAllowedMarketplaceId(body.marketplace_id) ? body.marketplace_id : null)
        : (existing?.marketplaceId ?? null);

    await prisma.userPreferences.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        defaultSellerType,
        defaultShippingCostFbm,
        catalogPageSize,
        marketplaceId,
      },
      update: {
        defaultSellerType,
        defaultShippingCostFbm,
        catalogPageSize,
        marketplaceId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Preferences save error:", e);
    const message = e instanceof Error ? e.message : "Failed to save preferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
