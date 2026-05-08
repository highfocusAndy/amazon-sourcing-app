import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { prisma } from "@/lib/db";

const MAX_BYTES = 600_000; // ceiling (browser also resizes)
type AllowedMime = "image/jpeg" | "image/png" | "image/webp";

function isAllowedMime(s: string): s is AllowedMime {
  return s === "image/jpeg" || s === "image/png" || s === "image/webp";
}

function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    /* RIFF …. WEBP */
    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "image/png";
  return null;
}

function rowToBuffer(raw: Uint8Array | Buffer | unknown): Buffer | null {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) return raw.length ? raw : null;
  if (typeof raw === "object" && raw instanceof Uint8Array) return raw.byteLength ? Buffer.from(raw) : null;
  return null;
}

/** GET authenticated user's profile image bytes (cookie/session). */
export async function GET(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  try {
    const row = await prisma.user.findUnique({
      where: { id: gate.userId },
      select: { profileImage: true, profileImageMime: true },
    });
    const buf = rowToBuffer(row?.profileImage as Uint8Array | Buffer | unknown);
    if (!buf?.length) {
      return new NextResponse(null, { status: 404 });
    }

    const stored = row?.profileImageMime?.trim();
    const ct: AllowedMime =
      stored && isAllowedMime(stored) ? stored : (sniffMime(buf) ?? "image/jpeg");

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("profile-image GET:", e);
    return NextResponse.json({ error: "Failed to load image." }, { status: 500 });
  }
}

/** Upload / replace profile image (JPEG/PNG/WebP). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  try {
    const formData = await req.formData();
    const file = formData.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image field." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) return NextResponse.json({ error: "Empty file." }, { status: 400 });
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: `Image too large (max ${MAX_BYTES / 1000}KB).` }, { status: 400 });
    }

    const sniffed = sniffMime(buf);
    const claimed = typeof file.type === "string" && file.type ? file.type.trim() : "";

    let mime: AllowedMime | null = sniffed;
    if (!mime && isAllowedMime(claimed)) {
      mime = claimed;
    }
    if (!mime) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: gate.userId },
      data: { profileImageMime: mime, profileImage: buf },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("profile-image POST:", e);
    if (e instanceof Error && e.name === "PrismaClientValidationError") {
      return NextResponse.json(
        {
          error:
            "Server Prisma client is out of date. Stop `npm run dev`, run `npx prisma generate`, then start the dev server again.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

/** Remove profile image. */
export async function DELETE(): Promise<NextResponse> {
  const gate = await requireAppAccess();
  if (!gate.ok) return gate.response;

  try {
    await prisma.user.update({
      where: { id: gate.userId },
      data: { profileImageMime: null, profileImage: null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("profile-image DELETE:", e);
    return NextResponse.json({ error: "Failed to remove image." }, { status: 500 });
  }
}
