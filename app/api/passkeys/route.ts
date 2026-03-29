import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** List passkeys for the signed-in user. */
export async function GET() {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  const rows = await prisma.passkeyCredential.findMany({
    where: { userId: gate.userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ passkeys: rows });
}
