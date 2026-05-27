import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isBuyerModeEnabled } from "@/lib/featureFlags";

export const runtime = "nodejs";

/**
 * Amazon's public completion endpoint — same one their homepage search bar uses.
 * Returns a JSON array shaped like ["query", ["suggestion1", "suggestion2", ...]].
 */
const AMAZON_COMPLETION_URL =
  "https://completion.amazon.com/search/complete?method=completion&search-alias=aps&client=amazon-search-ui&mkt=1";

const FALLBACK_SUFFIXES = ["men", "women", "kids", "for boys", "for girls", "set"];
const FALLBACK_PREFIXES = ["best", "popular", "cheap"];

function localSuggestions(q: string): string[] {
  const base = q.trim().toLowerCase();
  if (!base) return [];
  const out = new Set<string>();
  out.add(base);
  for (const p of FALLBACK_PREFIXES) out.add(`${p} ${base}`);
  for (const s of FALLBACK_SUFFIXES) out.add(`${base} ${s}`);
  return Array.from(out).slice(0, 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isBuyerModeEnabled())) {
    return NextResponse.json({ error: "Buyer mode is not enabled." }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });

  // Try Amazon's completion endpoint first.
  try {
    const url = `${AMAZON_COMPLETION_URL}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      // Short timeout so a slow/blocked upstream doesn't hang the typing experience.
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const raw = await res.text();
      // Response is either a JSON array or JSONP-ish. Parse defensively.
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && Array.isArray(parsed[1])) {
          const items = (parsed[1] as unknown[])
            .map((v) => (typeof v === "string" ? v : ""))
            .filter((s) => s.length > 0)
            .slice(0, 10);
          if (items.length > 0) {
            return NextResponse.json({ suggestions: items });
          }
        }
      } catch {
        /* fall through to local */
      }
    }
  } catch {
    /* fall through to local */
  }

  return NextResponse.json({ suggestions: localSuggestions(q) });
}
