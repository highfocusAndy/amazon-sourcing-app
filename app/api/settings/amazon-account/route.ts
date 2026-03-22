import { auth } from "@/auth";
import { refreshAmazonStoreNameForUser } from "@/lib/amazonAccount";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MIN_PASSWORD_LENGTH = 8;

function maskSellerId(sellerId: string): string {
  const s = sellerId.trim();
  if (s.length <= 4) return "***";
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

/** Returns linked Amazon seller (OAuth) and/or legacy saved email (masked). */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.amazonAccount.findUnique({
    where: { userId: session.user.id },
    select: {
      amazonEmail: true,
      amazonStoreName: true,
      spRefreshTokenEnc: true,
      sellerId: true,
      updatedAt: true,
    },
  });

  if (!account) {
    return NextResponse.json({ connected: false });
  }

  const oauthConnected = !!(account.spRefreshTokenEnc && account.sellerId);
  const legacyEmail = account.amazonEmail?.trim();

  if (!oauthConnected && !legacyEmail) {
    return NextResponse.json({ connected: false });
  }

  let emailMasked: string | undefined;
  if (legacyEmail) {
    const at = legacyEmail.indexOf("@");
    emailMasked =
      at > 2
        ? `${legacyEmail.slice(0, 2)}***${legacyEmail.slice(at)}`
        : legacyEmail.length > 4
          ? `${legacyEmail.slice(0, 1)}***${legacyEmail.slice(-1)}`
          : "***";
  }

  const sellerIdMasked =
    oauthConnected && account.sellerId ? maskSellerId(account.sellerId) : undefined;

  let storeName = account.amazonStoreName?.trim() || null;
  if (oauthConnected && !storeName) {
    const refreshed = await refreshAmazonStoreNameForUser(session.user.id);
    if (refreshed) storeName = refreshed;
  }

  const connectionLabel = oauthConnected
    ? storeName
      ? storeName
      : sellerIdMasked
        ? `Seller ${sellerIdMasked}`
        : "Amazon seller linked"
    : emailMasked ?? "Amazon";

  return NextResponse.json({
    connected: true,
    oauthConnected,
    sellerIdMasked,
    emailMasked,
    storeName,
    connectionLabel,
    updatedAt: account.updatedAt.toISOString(),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = typeof body.password === "string" ? body.password.trim() : "";

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 },
      );
    }

    const existing = await prisma.amazonAccount.findUnique({
      where: { userId: session.user.id },
    });
    const isUpdate = !!existing;
    if (isUpdate && !password) {
      await prisma.amazonAccount.update({
        where: { userId: session.user.id },
        data: { amazonEmail: email },
      });
      return NextResponse.json({ ok: true });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const amazonPasswordHash = await hash(password, 12);
    await prisma.amazonAccount.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        amazonEmail: email,
        amazonPasswordHash,
      },
      update: {
        amazonEmail: email,
        amazonPasswordHash,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Amazon account save error:", e);
    return NextResponse.json(
      { error: "Failed to save Amazon account. Please try again." },
      { status: 500 },
    );
  }
}

/** Disconnect OAuth tokens (and remove row if nothing else remains). */
export async function DELETE(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const row = await prisma.amazonAccount.findUnique({
      where: { userId: session.user.id },
    });
    if (!row) {
      return NextResponse.json({ ok: true });
    }

    await prisma.amazonAccount.update({
      where: { userId: session.user.id },
      data: {
        spRefreshTokenEnc: null,
        sellerId: null,
        oauthMarketplaceId: null,
        amazonStoreName: null,
        /** Clear legacy saved seller email/password too, or GET still reports `connected: true`. */
        amazonEmail: null,
        amazonPasswordHash: null,
      },
    });

    const after = await prisma.amazonAccount.findUnique({
      where: { userId: session.user.id },
    });
    if (after && !after.amazonEmail?.trim() && !after.amazonPasswordHash) {
      await prisma.amazonAccount.delete({ where: { userId: session.user.id } });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Amazon account disconnect error:", e);
    return NextResponse.json(
      { error: "Failed to disconnect." },
      { status: 500 },
    );
  }
}
