import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const promos = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { redemptions: true } },
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        take: 5,
        select: { redeemedAt: true, user: { select: { email: true } } },
      },
    },
  });

  return NextResponse.json({ ok: true, promos });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const body = (await request.json()) as {
    code: string;
    label?: string;
    grantsDays: number;
    maxRedemptions?: number | null;
    expiresAt?: string | null;
    allowRepeatRedemption?: boolean;
  };

  const code = body.code?.trim().toUpperCase();
  if (!code || code.length < 3) {
    return NextResponse.json({ error: "code must be at least 3 characters" }, { status: 400 });
  }
  const grantsDays = Number(body.grantsDays);
  if (!Number.isFinite(grantsDays) || grantsDays < 1) {
    return NextResponse.json({ error: "grantsDays must be a positive number" }, { status: 400 });
  }

  const promo = await prisma.promoCode.create({
    data: {
      code,
      label: body.label?.trim() || null,
      grantsDays,
      maxRedemptions: body.maxRedemptions ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      allowRepeatRedemption: body.allowRepeatRedemption ?? false,
      active: true,
    },
  });

  return NextResponse.json({ ok: true, promo });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const body = (await request.json()) as {
    id: string;
    active?: boolean;
    label?: string;
    grantsDays?: number;
    maxRedemptions?: number | null;
    expiresAt?: string | null;
    allowRepeatRedemption?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.label === "string") data.label = body.label.trim() || null;
  if (typeof body.grantsDays === "number") data.grantsDays = body.grantsDays;
  if ("maxRedemptions" in body) data.maxRedemptions = body.maxRedemptions ?? null;
  if ("expiresAt" in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (typeof body.allowRepeatRedemption === "boolean") data.allowRepeatRedemption = body.allowRepeatRedemption;

  const promo = await prisma.promoCode.update({ where: { id: body.id }, data });
  return NextResponse.json({ ok: true, promo });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.promoCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
