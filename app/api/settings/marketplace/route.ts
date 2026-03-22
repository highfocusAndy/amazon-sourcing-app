import { auth } from "@/auth";
import { NextResponse } from "next/server";

/** GET: return current marketplace ID (from server env) for display in Settings. */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marketplaceId =
    process.env.MARKETPLACE_ID?.trim() ||
    process.env.SP_API_MARKETPLACE_ID?.trim() ||
    "ATVPDKIKX0DER";

  const label =
    marketplaceId === "ATVPDKIKX0DER"
      ? "US (North America)"
      : marketplaceId === "A1PA6795UKMFR9"
      ? "DE (Germany)"
      : marketplaceId === "A1F83G8C2ARO7P"
      ? "UK"
      : marketplaceId;

  return NextResponse.json({
    marketplace_id: marketplaceId,
    label,
    note: "Set MARKETPLACE_ID or SP_API_MARKETPLACE_ID in .env.local to change.",
  });
}
