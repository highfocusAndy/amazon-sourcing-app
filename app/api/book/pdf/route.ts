import { auth } from "@/auth";
import { userHasAppAccess } from "@/lib/billing/access";
import { readFile } from "fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";

/**
 * Default: `private/high-focus-ebook.pdf` (not in /public — avoids direct URLs).
 * Override with EBOOK_PDF_PATH (absolute or relative to project root), or
 * EBOOK_PDF_FILENAME + EBOOK_PDF_DIR (`public` | `private`, default `private`).
 */
function resolveEbookAbsolutePath(): string | null {
  const custom = process.env.EBOOK_PDF_PATH?.trim();
  if (custom) {
    return path.isAbsolute(custom) ? custom : path.join(process.cwd(), custom);
  }
  const name = process.env.EBOOK_PDF_FILENAME?.trim() || "high-focus-ebook.pdf";
  const dir = process.env.EBOOK_PDF_DIR?.trim().toLowerCase() === "public" ? "public" : "private";
  return path.join(process.cwd(), dir, name);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!(await userHasAppAccess(session.user.id, session.user.email ?? null))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const filePath = resolveEbookAbsolutePath();
  if (!filePath) {
    return new NextResponse("E-book not configured", { status: 404 });
  }

  const asDownload = request.nextUrl.searchParams.get("download") === "1";

  try {
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${
          asDownload ? "attachment" : "inline"
        }; filename="high-focus-ebook.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("E-book file not found", { status: 404 });
  }
}
