/**
 * GET/PUT /api/admin/feature-flags
 * Manage application feature flags stored in SystemConfig (key prefix "ff:").
 * GET returns all flags; PUT accepts { key, enabled } to toggle a flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FLAGS: { key: string; label: string; description: string }[] = [
  { key: "ff:image_search", label: "Image Search (Scan)", description: "Allow users to search by product photo" },
  { key: "ff:ai_product_insight", label: "AI Product Insight", description: "Show AI analysis panel on product detail" },
  { key: "ff:ai_chat", label: "AI Amazon Chat", description: "Show the Ask AI chat widget" },
  { key: "ff:bulk_upload", label: "Bulk Upload", description: "Allow .xlsx/.csv list uploads" },
  { key: "ff:pa_api_bsr", label: "PA-API Main BSR", description: "Fetch main-category BSR via Product Advertising API" },
  {
    key: "ff:pa_api_catalog",
    label: "PA-API Catalog Browse",
    description: "Use Product Advertising API for catalog search. When off, catalog uses SP-API.",
  },
  { key: "ff:analyzer_page", label: "Catalog Analyzer", description: "Enable the Analyzer / Explorer page" },
  {
    key: "ff:buyer_mode",
    label: "Buyer Mode",
    description: "Show buyer card on pricing, mode toggle in sidebar, and /buyer catalog page. Uses PA-API if configured, otherwise falls back to SP-API. Default: OFF.",
  },
];

const FLAG_DEFAULTS: Record<string, boolean> = {
  "ff:pa_api_catalog": false,
  "ff:buyer_mode": false,
};

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const stored = await prisma.systemConfig.findMany({
    where: { key: { startsWith: "ff:" } },
  });
  const storedMap = Object.fromEntries(stored.map((s) => [s.key, s.value]));

  const flags = DEFAULT_FLAGS.map((f) => ({
    ...f,
    enabled: storedMap[f.key] !== undefined ? storedMap[f.key] === "true" : (FLAG_DEFAULTS[f.key] ?? true),
  }));

  return NextResponse.json({ ok: true, flags });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const body = (await req.json()) as { key?: string; enabled?: boolean | string };
  const key = (body.key ?? "").trim();
  const enabled = body.enabled === true || body.enabled === "true";

  if (!key.startsWith("ff:") || !DEFAULT_FLAGS.some((f) => f.key === key)) {
    return NextResponse.json({ error: "Invalid flag key" }, { status: 400 });
  }

  await prisma.systemConfig.upsert({
    where: { key },
    update: { value: enabled ? "true" : "false" },
    create: { key, value: enabled ? "true" : "false" },
  });

  return NextResponse.json({ ok: true, key, enabled });
}
