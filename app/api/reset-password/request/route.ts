import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appOrigin } from "@/lib/appOrigin";
import {
  createPasswordResetSecret,
  hashPasswordResetSecret,
  passwordResetTtlMs,
} from "@/lib/passwordResetToken";
import { passwordResetEmailContent, sendTransactionalEmail } from "@/lib/sendTransactionalEmail";

const SENT_MESSAGE = "Reset link sent.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  let origin: string;
  try {
    origin = appOrigin();
  } catch (e) {
    console.error("[reset-password] Missing NEXTAUTH_URL / APP_BASE_URL:", e);
    return NextResponse.json(
      { error: "Password reset is not available right now. Try again later." },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (!user) {
    return NextResponse.json(
      {
        ok: true,
        emailSent: false,
        message: "No account exists for this email.",
      },
      { status: 200 },
    );
  }

  const rawToken = createPasswordResetSecret();
  const tokenHash = hashPasswordResetSecret(rawToken);
  const expiresAt = new Date(Date.now() + passwordResetTtlMs());
  const appLabel = process.env.NEXT_PUBLIC_APP_TITLE?.trim() || "HIGH FOCUS Sourcing";

  let tokenRowId: string;
  try {
    const row = await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return tx.passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt },
        select: { id: true },
      });
    });
    tokenRowId = row.id;
  } catch (e) {
    console.error("[reset-password] DB error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Try again in a moment." },
      { status: 500 },
    );
  }

  const resetUrl = `${origin}/reset-password/confirm?token=${encodeURIComponent(rawToken)}`;
  const { subject, html, text } = passwordResetEmailContent({ resetUrl, appLabel });

  const sent = await sendTransactionalEmail({ to: email, subject, html, text });
  if (!sent.ok) {
    console.error("[reset-password] Email send failed:", sent.error);
    await prisma.passwordResetToken.delete({ where: { id: tokenRowId } }).catch(() => {});
    return NextResponse.json(
      { error: "Could not send email right now. Try again later or contact support." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, emailSent: true, message: SENT_MESSAGE });
}
