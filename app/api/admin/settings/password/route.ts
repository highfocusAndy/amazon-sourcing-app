import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { checkAdminPassword, hashAndStoreAdminPassword, isAdminPasswordRequired } from "@/lib/adminAuth";

export const runtime = "nodejs";

/** PATCH — change the admin password (requires current password + new password). */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  if (!await isAdminPasswordRequired()) {
    return NextResponse.json({ error: "Admin password is not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
  const { currentPassword = "", newPassword = "" } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const currentOk = await checkAdminPassword(currentPassword);
  if (!currentOk) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  await hashAndStoreAdminPassword(newPassword);
  return NextResponse.json({ ok: true });
}
