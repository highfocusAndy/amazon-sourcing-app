import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** Remove one passkey by its database id (cuid). */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const row = await prisma.passkeyCredential.findFirst({
    where: { id, userId: gate.userId },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.passkeyCredential.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
