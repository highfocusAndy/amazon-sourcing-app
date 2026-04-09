import { NextResponse } from "next/server";

import { productAnalysisForInsightApi } from "@/lib/ai/productInsightPayload";
import { HIGH_FOCUS_AMAZON_CHAT_SYSTEM, productInsightUserPrompt } from "@/lib/ai/amazonAssistantPrompts";
import { userOpenaiInsightLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { consumeMonthlyUsage } from "@/lib/usageQuota";
import type { ProductAnalysis } from "@/lib/types";

export const runtime = "nodejs";

function firstParagraph(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const para = t.split(/\n\n+/)[0]?.trim() ?? t;
  return para.replace(/\s+/g, " ").slice(0, 1200);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "AI insights are not enabled (missing OPENAI_API_KEY).", code: "OPENAI_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userOpenaiInsightLimit(gate.userId)) {
      return NextResponse.json({ ok: false, error: "Too many AI requests. Wait a minute." }, { status: 429 });
    }

    const body = (await req.json()) as { product?: unknown };
    if (!body.product || typeof body.product !== "object") {
      return NextResponse.json({ ok: false, error: "Missing product." }, { status: 400 });
    }

    const usage = await consumeMonthlyUsage(gate.userId, "openai_insight");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly AI insight limit reached for your plan.",
          errorDetail: { code: "USAGE_LIMIT", metric: usage.metric, used: usage.used, limit: usage.limit },
        },
        { status: 429 },
      );
    }

    const product = body.product as ProductAnalysis;
    const snapshot = productAnalysisForInsightApi(product);
    const snapshotJson = JSON.stringify(snapshot);
    if (snapshotJson.length > 48_000) {
      return NextResponse.json({ ok: false, error: "Product payload too large." }, { status: 413 });
    }

    const model = process.env.OPENAI_INSIGHT_MODEL?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";

    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 280,
        temperature: 0.4,
        messages: [
          { role: "system", content: HIGH_FOCUS_AMAZON_CHAT_SYSTEM },
          { role: "user", content: productInsightUserPrompt(snapshotJson) },
        ],
      }),
    });

    if (!oaiRes.ok) {
      const detail = await oaiRes.text();
      return NextResponse.json(
        { ok: false, error: `AI request failed (${oaiRes.status}).`, detail: detail.slice(0, 400) },
        { status: 502 },
      );
    }

    const completion = (await oaiRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const insight = firstParagraph(raw);
    if (!insight) {
      return NextResponse.json({ ok: true, insight: "No insight returned. Try again.", model });
    }

    return NextResponse.json({ ok: true, insight, model });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "AI insight failed." },
      { status: 500 },
    );
  }
}
