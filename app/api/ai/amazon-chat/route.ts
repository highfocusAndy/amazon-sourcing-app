import { NextResponse } from "next/server";

import { HIGH_FOCUS_AMAZON_CHAT_SYSTEM } from "@/lib/ai/amazonAssistantPrompts";
import { userOpenaiChatLimit } from "@/lib/apiRateLimit";
import { requireAppAccess } from "@/lib/billing/requireAppAccess";
import { consumeMonthlyUsage } from "@/lib/usageQuota";

export const runtime = "nodejs";

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 6000;
const MAX_OUTPUT_TOKENS = 900;

type ChatRole = "user" | "assistant";

type IncomingMessage = { role?: string; content?: string };

function normalizeMessages(raw: unknown): { ok: true; messages: Array<{ role: ChatRole; content: string }> } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "messages must be an array." };
  }
  const slice = raw.slice(-MAX_MESSAGES) as IncomingMessage[];
  const out: Array<{ role: ChatRole; content: string }> = [];
  for (const m of slice) {
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, error: 'Each message needs role "user" or "assistant".' };
    }
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!content) {
      return { ok: false, error: "Empty message." };
    }
    if (content.length > MAX_CONTENT_LEN) {
      return { ok: false, error: "Message too long." };
    }
    out.push({ role: m.role, content });
  }
  if (out.length === 0) {
    return { ok: false, error: "Send at least one user message." };
  }
  if (out[out.length - 1]!.role !== "user") {
    return { ok: false, error: "Last message must be from the user." };
  }
  return { ok: true, messages: out };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "AI chat is not enabled (missing OPENAI_API_KEY).", code: "OPENAI_UNAVAILABLE" },
        { status: 503 },
      );
    }

    const gate = await requireAppAccess();
    if (!gate.ok) return gate.response;

    if (!userOpenaiChatLimit(gate.userId)) {
      return NextResponse.json({ ok: false, error: "Too many chat requests. Wait a minute." }, { status: 429 });
    }

    const body = (await req.json()) as { messages?: unknown };
    const parsed = normalizeMessages(body.messages);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const usage = await consumeMonthlyUsage(gate.userId, "openai_chat");
    if (!usage.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Monthly AI chat limit reached for your plan.",
          errorDetail: { code: "USAGE_LIMIT", metric: usage.metric, used: usage.used, limit: usage.limit },
        },
        { status: 429 },
      );
    }

    const model = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";

    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.5,
        messages: [{ role: "system", content: HIGH_FOCUS_AMAZON_CHAT_SYSTEM }, ...parsed.messages],
      }),
    });

    if (!oaiRes.ok) {
      const detail = await oaiRes.text();
      return NextResponse.json(
        { ok: false, error: `AI chat failed (${oaiRes.status}).`, detail: detail.slice(0, 400) },
        { status: 502 },
      );
    }

    const completion = (await oaiRes.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const reply = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return NextResponse.json({ ok: true, reply: "I could not generate a reply. Please try again.", model });
    }

    return NextResponse.json({ ok: true, reply, model });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Chat failed." },
      { status: 500 },
    );
  }
}
