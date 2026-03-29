import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DEFAULTS = {
  showKeyword: true,
  showSort: true,
  showBsr: true,
  showMinRoi: false,
  showMinProfit: false,
  showFbaFbm: false,
  showRestriction: false,
  showPriceRange: false,
} as const;

type ExplorerFiltersPayload = {
  show_keyword?: boolean;
  show_sort?: boolean;
  show_bsr?: boolean;
  show_min_roi?: boolean;
  show_min_profit?: boolean;
  show_fba_fbm?: boolean;
  show_restriction?: boolean;
  show_price_range?: boolean;
};

/** GET: return current user's explorer filter settings (or defaults). */
export async function GET(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const defaults = {
    show_keyword: DEFAULTS.showKeyword,
    show_sort: DEFAULTS.showSort,
    show_bsr: DEFAULTS.showBsr,
    show_min_roi: DEFAULTS.showMinRoi,
    show_min_profit: DEFAULTS.showMinProfit,
    show_fba_fbm: DEFAULTS.showFbaFbm,
    show_restriction: DEFAULTS.showRestriction,
    show_price_range: DEFAULTS.showPriceRange,
  };

  if (typeof (prisma as { userExplorerFilters?: { findUnique: unknown } }).userExplorerFilters?.findUnique !== "function") {
    return NextResponse.json(defaults);
  }

  try {
    const row = await prisma.userExplorerFilters.findUnique({
      where: { userId: gate.userId },
    });

    if (!row) {
      return NextResponse.json(defaults);
    }

    return NextResponse.json({
      show_keyword: row.showKeyword,
      show_sort: row.showSort,
      show_bsr: row.showBsr,
      show_min_roi: row.showMinRoi,
      show_min_profit: row.showMinProfit,
      show_fba_fbm: row.showFbaFbm,
      show_restriction: row.showRestriction,
      show_price_range: row.showPriceRange,
    });
  } catch {
    return NextResponse.json(defaults);
  }
}

/** POST: update explorer filter settings. Body: same shape as GET response. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const repo = (prisma as { userExplorerFilters?: { upsert: unknown } }).userExplorerFilters;
  if (typeof repo?.upsert !== "function") {
    return NextResponse.json(
      { error: "Settings database not ready. Stop the dev server, run: npx prisma generate, then restart." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as ExplorerFiltersPayload;
    const data = {
      showKeyword: body.show_keyword ?? DEFAULTS.showKeyword,
      showSort: body.show_sort ?? DEFAULTS.showSort,
      showBsr: body.show_bsr ?? DEFAULTS.showBsr,
      showMinRoi: body.show_min_roi ?? DEFAULTS.showMinRoi,
      showMinProfit: body.show_min_profit ?? DEFAULTS.showMinProfit,
      showFbaFbm: body.show_fba_fbm ?? DEFAULTS.showFbaFbm,
      showRestriction: body.show_restriction ?? DEFAULTS.showRestriction,
      showPriceRange: body.show_price_range ?? DEFAULTS.showPriceRange,
    };

    await prisma.userExplorerFilters.upsert({
      where: { userId: gate.userId },
      create: {
        userId: gate.userId,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save settings.";
    console.error("Explorer filters save error:", e);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
