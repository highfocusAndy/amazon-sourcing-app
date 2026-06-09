/**
 * POST /api/cron/trial-reminder
 * Sends a "trial ending soon" email to users whose trial expires in 1-2 days.
 * Protected by CRON_SECRET header. Call daily from Railway cron or any scheduler.
 *
 * Tracks sent emails in SystemConfig (key: trial_reminder:{userId}) to avoid duplicates.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTransactionalEmail, trialExpiryReminderEmailContent } from "@/lib/sendTransactionalEmail";
import { appDisplayName } from "@/lib/appBranding";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const provided = request.headers.get("x-cron-secret")?.trim();
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const oneDayMs = 86_400_000;
  const windowStart = new Date(now + oneDayMs);       // 24h from now
  const windowEnd   = new Date(now + 2 * oneDayMs);   // 48h from now

  // Find users whose trial ends in the next 24-48h and have a real trial (not epoch)
  const candidates = await prisma.user.findMany({
    where: {
      trialEndsAt: { gte: windowStart, lte: windowEnd },
      subscriptionStatus: { not: "active" },
      email: { not: null },
    },
    select: { id: true, email: true, trialEndsAt: true },
  });

  const baseUrl = process.env.NEXTAUTH_URL?.trim() ?? "";
  const upgradeUrl = `${baseUrl}/subscribe`;
  let sent = 0;
  let skipped = 0;

  for (const user of candidates) {
    if (!user.email) continue;

    const reminderKey = `trial_reminder:${user.id}`;
    const alreadySent = await prisma.systemConfig.findUnique({ where: { key: reminderKey } });
    if (alreadySent) { skipped++; continue; }

    const msLeft = (user.trialEndsAt?.getTime() ?? 0) - now;
    const daysLeft = Math.max(1, Math.ceil(msLeft / oneDayMs));

    const { subject, html, text } = trialExpiryReminderEmailContent({
      appLabel: appDisplayName,
      upgradeUrl,
      daysLeft,
    });

    const result = await sendTransactionalEmail({ to: user.email, subject, html, text });
    if (result.ok) {
      await prisma.systemConfig.create({ data: { key: reminderKey, value: new Date().toISOString() } });
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, candidates: candidates.length });
}
