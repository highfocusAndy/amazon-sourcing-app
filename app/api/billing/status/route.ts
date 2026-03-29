import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getBillingOverview } from "@/lib/billing/access";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const overview = await getBillingOverview(session.user.id, session.user.email);
  return NextResponse.json(overview);
}
