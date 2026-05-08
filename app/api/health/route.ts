import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Public readiness check for Railway / uptime monitors (no secrets in response).
 * Configure in Railway: Service → Settings → Health check path → `/api/health`
 */
export async function GET(): Promise<NextResponse> {
  const ts = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: "ready", db: "ok", ts });
  } catch {
    return NextResponse.json({ ok: false, status: "degraded", db: "error", ts }, { status: 503 });
  }
}
