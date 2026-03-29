import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashPasswordResetSecret } from "@/lib/passwordResetToken";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let token = "";
  let newPassword = "";
  try {
    const body = (await request.json()) as { token?: string; newPassword?: string };
    token = typeof body.token === "string" ? body.token.trim() : "";
    newPassword = (
      typeof body.newPassword === "string" ? body.newPassword : String(body.newPassword ?? "")
    ).trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!token || !newPassword) {
    return NextResponse.json({ error: "Token and new password are required." }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const tokenHash = hashPasswordResetSecret(token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!row || row.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one from the login page." },
      { status: 400 },
    );
  }

  const passwordHash = await hash(newPassword, 12);
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
    ]);
  } catch (e) {
    console.error("[reset-password] confirm error:", e);
    return NextResponse.json({ error: "Could not update password. Try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Password updated. You can sign in with your new password.",
  });
}
