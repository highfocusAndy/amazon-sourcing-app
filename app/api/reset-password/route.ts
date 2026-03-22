import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Development-only: set a new password for an existing account (no email needed).
 * Use this when you can't sign in and need to reset your password.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Password reset is only available in development." },
      { status: 404 }
    );
  }

  try {
    const body = (await request.json()) as { email?: string; newPassword?: string };
    const email = body.email?.trim().toLowerCase();
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : String(body.newPassword ?? "");

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: "Email and new password are required." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email." },
        { status: 404 }
      );
    }

    const passwordHash = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({
      ok: true,
      message: "Password updated. You can now sign in with your new password.",
    });
  } catch (e) {
    console.error("Reset password error:", e);
    return NextResponse.json(
      { error: "Failed to reset password. Try again." },
      { status: 500 }
    );
  }
}
