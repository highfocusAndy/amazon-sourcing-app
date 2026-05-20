/**
 * GET /api/admin/pa-api-test
 * Diagnostic endpoint: tests the Creators API OAuth token fetch and a real searchItems call.
 * Admin-only. Remove this file once the integration is verified.
 */

import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/app/api/admin/guard";
import { searchCatalogByKeywordPaApi } from "@/lib/paApiClient";

export const runtime = "nodejs";

const LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";
const DEFAULT_SCOPE = "creatorsapi::default";

export async function GET(): Promise<NextResponse> {
  const gate = await requireAdminAccess();
  if (!gate.ok) return gate.response;

  const clientId = process.env.PA_API_ACCESS_KEY?.trim() ?? "";
  const clientSecret = process.env.PA_API_SECRET_KEY?.trim() ?? "";
  const partnerTag = process.env.PA_API_PARTNER_TAG?.trim() ?? "";
  const scope = process.env.PA_API_OAUTH_SCOPE?.trim() || DEFAULT_SCOPE;

  const result: Record<string, unknown> = {
    env: {
      PA_API_ACCESS_KEY: clientId ? `${clientId.slice(0, 24)}…` : "(not set)",
      PA_API_SECRET_KEY: clientSecret ? `${clientSecret.slice(0, 6)}…` : "(not set)",
      PA_API_PARTNER_TAG: partnerTag || "(not set)",
      PA_API_OAUTH_SCOPE: scope,
    },
  };

  if (!clientId || !clientSecret || !partnerTag) {
    result.error = "One or more PA-API env vars missing.";
    return NextResponse.json(result);
  }

  try {
    const formBody = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    });
    const tokenRes = await fetch(LWA_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
      cache: "no-store",
    });
    const tokenRaw = await tokenRes.text();
    let tokenJson: Record<string, unknown> = {};
    try {
      tokenJson = JSON.parse(tokenRaw);
    } catch {
      /* non-JSON */
    }
    result.tokenStep = {
      status: tokenRes.status,
      ok: tokenRes.ok,
      body: tokenJson,
    };
    if (!tokenRes.ok || typeof tokenJson.access_token !== "string") {
      result.verdict = "TOKEN_FETCH_FAILED";
      return NextResponse.json(result);
    }
  } catch (e) {
    result.tokenStep = { error: e instanceof Error ? e.message : String(e) };
    result.verdict = "TOKEN_FETCH_EXCEPTION";
    return NextResponse.json(result);
  }

  const search = await searchCatalogByKeywordPaApi("fiction", 3, "Books");
  result.apiStep = search;
  result.verdict = search.ok ? "OK" : "API_CALL_FAILED";

  return NextResponse.json(result, { status: 200 });
}
