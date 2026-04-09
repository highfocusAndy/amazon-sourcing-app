"use client";

import { useEffect, useMemo, useState } from "react";

import { productAnalysisForInsightApi } from "@/lib/ai/productInsightPayload";
import type { ProductAnalysis } from "@/lib/types";

/**
 * When OpenAI is configured, fetches an LLM insight for the selected product whenever the
 * analysis snapshot changes (debounced by JSON snapshot).
 */
export function useProductAiInsight(product: ProductAnalysis | null, openaiConfigured: boolean | null): {
  llmInsight: string | null;
  llmLoading: boolean;
  llmError: string | null;
} {
  const [llmInsight, setLlmInsight] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);

  const snapshotKey = useMemo(() => {
    if (!product || !openaiConfigured) return null;
    try {
      return JSON.stringify(productAnalysisForInsightApi(product));
    } catch {
      return null;
    }
  }, [product, openaiConfigured]);

  useEffect(() => {
    if (!product || !openaiConfigured || !snapshotKey) {
      setLlmInsight(null);
      setLlmLoading(false);
      setLlmError(null);
      return;
    }

    let cancelled = false;
    setLlmLoading(true);
    setLlmError(null);
    setLlmInsight(null);

    void (async () => {
      try {
        const res = await fetch("/api/ai/product-insight", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ product }),
        });
        const json = (await res.json()) as { ok?: boolean; insight?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.insight) {
          setLlmError(json.error ?? "Could not load AI insight.");
          setLlmInsight(null);
          return;
        }
        setLlmInsight(json.insight);
        setLlmError(null);
      } catch (e) {
        if (!cancelled) {
          setLlmError(e instanceof Error ? e.message : "AI insight failed.");
          setLlmInsight(null);
        }
      } finally {
        if (!cancelled) setLlmLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshotKey, product, openaiConfigured]);

  return { llmInsight, llmLoading, llmError };
}
