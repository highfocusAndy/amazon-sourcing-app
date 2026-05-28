import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { isAdminAuthenticated } from "@/lib/adminAuth";
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
 * Calls auth() once and reuses the session for both the email check and admin-password check.
 */
export async function requireAdminAccess(): Promise<GuardOk | GuardFail> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAppOwnerEmail(session.user.email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (!(await isAdminAuthenticated(session))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin password required" }, { status: 403 }),
    };
  }

  return { ok: true, userId: session.user.id, email: session.user.email ?? "" };
}
