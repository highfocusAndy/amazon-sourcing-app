import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import {
  ADMIN_AUTH_COOKIE,
  isAdminPasswordRequired,
  validateAdminSessionToken,
} from "@/lib/adminAuth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type GuardOk = { ok: true; userId: string; email: string };
type GuardFail = { ok: false; response: NextResponse };

/** Email-only check — used by the auth endpoint that sets the admin cookie. */
export async function requireAdminEmailOnly(): Promise<GuardOk | GuardFail> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAppOwnerEmail(session.user.email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: session.user.id, email: session.user.email ?? "" };
}

/**
 * Full guard for all /api/admin/* routes.
 * Checks email AND the admin-password cookie (when ADMIN_PASSWORD env var is set).
 */
export async function requireAdminAccess(): Promise<GuardOk | GuardFail> {
  const emailCheck = await requireAdminEmailOnly();
  if (!emailCheck.ok) return emailCheck;

  if (await isAdminPasswordRequired()) {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_AUTH_COOKIE)?.value ?? "";
    if (!validateAdminSessionToken(token, emailCheck.userId)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Admin password required" }, { status: 403 }),
      };
    }
  }

  return emailCheck;
}
