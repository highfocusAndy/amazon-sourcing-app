import { type NextRequest, NextResponse } from "next/server";
import { requireAdminEmailOnly } from "@/app/api/admin/guard";
import {
  ADMIN_AUTH_COOKIE,
  checkAdminPassword,
  generateAdminSessionToken,
  getSessionFingerprint,
  getRawNextAuthToken,
  isAdminPasswordRequired,
} from "@/lib/adminAuth";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/** POST — verify admin password and issue a session-bound cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminEmailOnly();
  if (!gate.ok) return gate.response;

  if (!await isAdminPasswordRequired()) {
    return NextResponse.json({ error: "Admin password is not configured" }, { status: 400 });
  }

  const body = (await req.json()) as { password?: string };
  const ok = await checkAdminPassword(body.password ?? "");
  if (!ok) {
    return NextResponse.json({ error: "Incorrect admin password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const rawNextAuth = getRawNextAuthToken(cookieStore);
  const fingerprint = getSessionFingerprint(rawNextAuth);
  const token = generateAdminSessionToken(gate.userId, fingerprint);

  cookieStore.set(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    // No maxAge → session cookie; browser discards it on close.
    // Token is also bound to the current NextAuth session, so
    // signing out and back in invalidates it automatically.
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — clear the admin session cookie. */
export async function DELETE(): Promise<NextResponse> {
  const gate = await requireAdminEmailOnly();
  if (!gate.ok) return gate.response;

  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
