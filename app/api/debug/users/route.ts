import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Dev-only: list user emails to verify DB is used for login. Remove or restrict in production. */
export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({
      count: users.length,
      message: "If count is 0, no users in DB — sign up first. If count > 0 but login fails, check terminal for [Auth] logs.",
      users: users.map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt })),
    });
  } catch (e) {
    console.error("[Debug users] DB error:", e);
    return NextResponse.json(
      { error: "Database error. Check DATABASE_URL and that you ran: npx prisma migrate dev" },
      { status: 500 }
    );
  }
}
