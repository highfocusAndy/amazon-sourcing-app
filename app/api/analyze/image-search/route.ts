import { NextRequest, NextResponse } from "next/server";

import { userKeywordSearchLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import {
  getSpApiClientForUserOrGlobal,
  SP_API_UNAVAILABLE_USER_MESSAGE,
} from "@/lib/amazonAccount";
import { buildCatalogOnlyResult } from "@/lib/analysis";
import type { ProductAnalysis } from "@/lib/types";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function firstLine(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Photo-based product search is not enabled on this server. Set OPENAI_API_KEY, or use a barcode/keyword.",
          code: "VISION_UNAVAILABLE",
          results: [] as ProductAnalysis[],
        },
        { status: 503 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userKeywordSearchLimit(gate.userId)) {
      return NextResponse.json(
        { ok: false, error: "Too many searches. Wait a minute.", results: [] },
        { status: 429 },
      );
    }

    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing image file.", results: [] }, { status: 400 });
    }

    const mime = image.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image.", results: [] },
        { status: 400 },
      );
    }

    if (image.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image too large (max 4 MB).", results: [] },
        { status: 413 },
      );
    }

    const usage = await consumeMonthlyUsage(gate.userId, "keyword_search");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly keyword-search limit reached for your plan.",
          errorDetail: {
            code: "USAGE_LIMIT",
            metric: usage.metric,
            period: usage.periodKey,
            used: usage.used,
            limit: usage.limit,
          },
          results: [],
        },
        { status: 429 },
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;

    const visionModel = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";

    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You help Amazon FBA sellers identify products from photos.
Reply with ONE line only: a short Amazon catalog search query in English to find this product—include visible brand and product name or type if you can read them. Maximum 14 words. No quotes. No labels like "Query:".
If the photo does not show a recognizable retail product, reply exactly: UNKNOWN`,
              },
              {
                type: "image_url",
                image_url: { url: dataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!oaiRes.ok) {
      const detail = await oaiRes.text();
      return NextResponse.json(
        {
          ok: false,
          error: `Image understanding request failed (${oaiRes.status}).`,
          detail: detail.slice(0, 500),
          results: [],
        },
        { status: 502 },
      );
    }

    const completion = (await oaiRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = firstLine(completion.choices?.[0]?.message?.content ?? "");
    if (!raw || /^UNKNOWN$/i.test(raw)) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
      });
    }

    const derivedQuery = raw.replace(/^["']|["']$/g, "").trim();
    if (!derivedQuery) {
      return NextResponse.json({
        ok: true,
        results: [] as ProductAnalysis[],
        derivedQuery: null,
      });
    }

    const client = await getSpApiClientForUserOrGlobal(gate.userId);
    if (!client) {
      return NextResponse.json(
        {
          ok: false,
          error: SP_API_UNAVAILABLE_USER_MESSAGE,
          results: [],
        },
        { status: 503 },
      );
    }

    const pageSize = Math.min(30, Math.max(1, parseInt(form.get("pageSize")?.toString() ?? "20", 10) || 20));
    const items = await client.searchCatalogByKeywordMultiple(derivedQuery, pageSize);
    const results: ProductAnalysis[] = items.map((catalog) => buildCatalogOnlyResult(catalog, derivedQuery));

    return NextResponse.json({
      ok: true,
      results,
      derivedQuery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Image search failed.",
        results: [],
      },
      { status: 500 },
    );
  }
}
