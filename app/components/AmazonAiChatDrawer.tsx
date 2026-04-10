"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatLine = { role: "user" | "assistant"; content: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** From GET /api/config — avoids exposing the API key. */
  openaiConfigured: boolean | null;
};

export function AmazonAiChatDrawer({ open, onClose, openaiConfigured }: Props) {
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages, sending]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || openaiConfigured !== true) return;

    const nextUser: ChatLine = { role: "user", content: trimmed };
    const history = [...messages, nextUser];
    setMessages(history);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/amazon-chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; reply?: string; error?: string };
      if (!res.ok || !json.reply) {
        setError(json.error ?? "Could not get a reply.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, openaiConfigured]);

  if (!open) return null;

  const chatReady = openaiConfigured === true;
  const disabled = !chatReady || sending;

  return (
    <>
      <button
        type="button"
        aria-label="Close AI chat"
        className="fixed inset-0 z-[118] bg-slate-950/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI about Amazon"
        className="fixed bottom-0 right-0 z-[120] flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col rounded-t-2xl border border-slate-600 border-b-0 bg-slate-900 shadow-2xl md:bottom-4 md:right-4 md:max-h-[min(85dvh,36rem)] md:rounded-2xl md:border-b"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-600/90 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Ask AI — Amazon &amp; compliance</h2>
            <p className="text-[11px] text-slate-500">Educational only — not legal or tax advice.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-lg leading-none text-slate-200 hover:bg-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {openaiConfigured === false ? (
          <p className="shrink-0 px-4 py-3 text-xs text-amber-200/90">
            AI chat needs <span className="font-mono text-[11px] text-slate-200">OPENAI_API_KEY</span> on the server.
          </p>
        ) : openaiConfigured === null ? (
          <p className="shrink-0 px-4 py-3 text-xs text-slate-500">Checking AI availability…</p>
        ) : null}

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ask about selling on Amazon, policies, risk, and sourcing — practical, educational answers (compliance-minded).
            </p>
          ) : null}
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-6 bg-teal-900/40 text-teal-50"
                  : "mr-4 border border-slate-600/60 bg-slate-800/80 text-slate-200"
              }`}
            >
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {m.role === "user" ? "You" : "Assistant"}
              </span>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ))}
          {sending ? (
            <p className="text-xs text-slate-500 animate-pulse" aria-live="polite">
              Thinking…
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="shrink-0 border-t border-slate-700/80 px-4 py-2 text-xs text-rose-300" role="alert">
            {error}
          </p>
        ) : null}

        <form
          className="shrink-0 border-t border-slate-600/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder={chatReady ? "Message…" : "AI chat unavailable"}
              disabled={disabled}
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border border-slate-600 bg-slate-800/90 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className="self-end rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
