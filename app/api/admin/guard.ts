import { auth } from "@/auth";
import { isAppOwnerEmail } from "@/lib/billing/appOwner";
import { NextResponse } from "next/server";

/**
 * Shared guard for all /api/admin/* routes.
 * Returns the userId on success, or a NextResponse 401/403 to return directly.
 */
export async function requireAdminAccess(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAppOwnerEmail(session.user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.user.id, email: session.user.email ?? "" };
}
