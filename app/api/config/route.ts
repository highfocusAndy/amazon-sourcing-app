import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";

const MARKETPLACE_DOMAINS: Record<string, string> = {
  ATVPDKIKX0DER: "amazon.com",
  A1F83G8C2ARO7P: "amazon.co.uk",
  A1PA6795UKMFR9: "amazon.de",
  A13V1IB3VIYZZH: "amazon.fr",
  A1C3SOZRARQ6R3: "amazon.es",
  APJ6JRA9NG5M4: "amazon.it",
  A2NODKZ7P85S9: "amazon.ca",
  A21TJRUUN4KGV: "amazon.in",
  A19VAU5U5O7RUS: "amazon.com.mx",
  A2Q3Y263D00KWC: "amazon.com.br",
};

export async function GET(): Promise<NextResponse> {
  try {
    const { marketplaceId } = getServerEnv();
    const marketplaceDomain = MARKETPLACE_DOMAINS[marketplaceId] ?? "amazon.com";
    return NextResponse.json({
      marketplaceId,
      marketplaceDomain,
    });
  } catch {
    return NextResponse.json(
      { marketplaceId: "ATVPDKIKX0DER", marketplaceDomain: "amazon.com" },
      { status: 200 },
    );
  }
}
