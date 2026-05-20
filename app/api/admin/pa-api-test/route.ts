/**
 * GET /api/admin/pa-api-test
 * Diagnostic endpoint: tests the PA-API OAuth token fetch and a real GetItems call.
 * Admin-only. Remove this file once the integration is verified.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";

export const runtime = "nodejs";

const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const PA_API_HOST = "webservices.amazon.com";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const clientId = process.env.PA_API_ACCESS_KEY?.trim() ?? "";
  const clientSecret = process.env.PA_API_SECRET_KEY?.trim() ?? "";
  const partnerTag = process.env.PA_API_PARTNER_TAG?.trim() ?? "";

  const result: Record<string, unknown> = {
    env: {
      PA_API_ACCESS_KEY: clientId ? `${clientId.slice(0, 24)}…` : "(not set)",
      PA_API_SECRET_KEY: clientSecret ? `${clientSecret.slice(0, 6)}…` : "(not set)",
      PA_API_PARTNER_TAG: partnerTag || "(not set)",
    },
  };

  if (!clientId || !clientSecret || !partnerTag) {
    result.error = "One or more PA-API env vars missing.";
    return NextResponse.json(result);
  }

  // --- Step 1: Token fetch ---
  let accessToken = "";
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "paapi",
    });
    const tokenRes = await fetch(LWA_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const tokenRaw = await tokenRes.text();
    let tokenJson: Record<string, unknown> = {};
    try { tokenJson = JSON.parse(tokenRaw); } catch { /* non-JSON */ }
    result.tokenStep = {
      status: tokenRes.status,
      ok: tokenRes.ok,
      body: tokenJson,
    };
    if (!tokenRes.ok || typeof tokenJson.access_token !== "string") {
      result.verdict = "TOKEN_FETCH_FAILED";
      return NextResponse.json(result);
    }
    accessToken = tokenJson.access_token as string;
  } catch (e) {
    result.tokenStep = { error: e instanceof Error ? e.message : String(e) };
    result.verdict = "TOKEN_FETCH_EXCEPTION";
    return NextResponse.json(result);
  }

  // --- Step 2: PA-API GetItems probe (B01LTHP2ZK = common test ASIN) ---
  try {
    const apiBody = JSON.stringify({
      ItemIds: ["B01LTHP2ZK"],
      ItemIdType: "ASIN",
      Marketplace: "www.amazon.com",
      PartnerTag: partnerTag,
      PartnerType: "Associates",
      Resources: ["ItemInfo.Title"],
    });
    const apiRes = await fetch(`https://${PA_API_HOST}/paapi5/getitems`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: apiBody,
      cache: "no-store",
    });
    const apiRaw = await apiRes.text();
    let apiJson: unknown = {};
    try { apiJson = JSON.parse(apiRaw); } catch { /* non-JSON */ }
    result.apiStep = {
      status: apiRes.status,
      ok: apiRes.ok,
      body: apiJson,
    };
    result.verdict = apiRes.ok ? "OK" : "API_CALL_FAILED";
  } catch (e) {
    result.apiStep = { error: e instanceof Error ? e.message : String(e) };
    result.verdict = "API_CALL_EXCEPTION";
  }

  return NextResponse.json(result, { status: 200 });
}
