import { NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { getMonthlyUsageSummary } from "@/lib/usageQuota";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;
  const summary = await getMonthlyUsageSummary(gate.userId);
  return NextResponse.json(summary);
}
