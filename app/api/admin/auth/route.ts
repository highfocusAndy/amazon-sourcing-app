import { type NextRequest, NextResponse } from "next/server";
import { requireAdminEmailOnly } from "@/app/api/admin/guard";
import {
  ADMIN_AUTH_COOKIE,
  checkAdminPassword,
  generateAdminSessionToken,
  isAdminPasswordRequired,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

/** POST — verify admin password and issue a session cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminEmailOnly();
  if (!gate.ok) return gate.response;

  if (!await isAdminPasswordRequired()) {
    return NextResponse.json({ error: "Admin password is not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { password?: string };
  const ok = await checkAdminPassword(body.password ?? "");
  if (!ok) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = generateAdminSessionToken(gate.userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // No maxAge → session cookie, cleared when browser closes.
    // The middleware also deletes this cookie when the user signs out.
  });
  return res;
}

/** DELETE — clear the admin session cookie. */
export async function DELETE(): Promise<NextResponse> {
  const gate = await requireAdminEmailOnly();
  if (!gate.ok) return gate.response;

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_AUTH_COOKIE);
  return res;
}
