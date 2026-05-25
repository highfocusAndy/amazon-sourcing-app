import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";
import { normalizePasswordInput } from "@/lib/passwordInput";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = normalizePasswordInput(body.password);
  const name = body.name?.trim() || null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists. Sign in instead." },
      { status: 409 },
    );
  }

  try {
    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, userMode: "buyer" },
      select: { email: true },
    });
    return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
