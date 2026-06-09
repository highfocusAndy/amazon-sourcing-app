import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { trialEndDateForNewUser } from "@/lib/billing/access";
import { prisma } from "@/lib/db";
import { normalizePasswordInput } from "@/lib/passwordInput";
import { rateLimitAllow } from "@/lib/apiRateLimit";
import { sendTransactionalEmail, welcomeEmailContent } from "@/lib/sendTransactionalEmail";
import { defaultTrialDays } from "@/lib/billing/access";
import { appDisplayName } from "@/lib/appBranding";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!rateLimitAllow(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Please wait an hour and try again." },
      { status: 429 },
    );
  }
  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = normalizePasswordInput(body.password);
  const name = body.name?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists. Sign in instead." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      trialEndsAt: trialEndDateForNewUser(),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL?.trim() ?? "";
  const { subject, html, text } = welcomeEmailContent({
    appLabel: appDisplayName,
    dashboardUrl: `${baseUrl}/dashboard`,
    trialDays: defaultTrialDays(),
  });
  void sendTransactionalEmail({ to: user.email, subject, html, text });

  return NextResponse.json({ ok: true, email: user.email });
}
