/**
 * GET/PUT /api/admin/legal/[slug]
 * Read and write legal page content (slug: "tos" | "privacy").
 * Access restricted to APP_OWNER_EMAIL.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED_SLUGS = new Set(["tos", "privacy"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const content = await prisma.legalContent.findUnique({ where: { slug } });
  return NextResponse.json({ content });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const body = (await req.json()) as { title?: string; contentHtml?: string };
  const title = (body.title ?? "").trim();
  const contentHtml = (body.contentHtml ?? "").trim();

  if (!title || !contentHtml) {
    return NextResponse.json({ error: "title and contentHtml are required" }, { status: 400 });
  }

  const content = await prisma.legalContent.upsert({
    where: { slug },
    update: { title, contentHtml },
    create: { slug, title, contentHtml },
  });

  return NextResponse.json({ ok: true, content });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  await prisma.legalContent.deleteMany({ where: { slug } });
  return NextResponse.json({ ok: true });
}
