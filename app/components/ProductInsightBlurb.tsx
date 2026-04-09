"use client";

import Link from "next/link";
import type { ProductAnalysis } from "@/lib/types";
import {
  buildProductInsightMessage,
  showConnectAmazonCta,
  showSignInCta,
} from "@/lib/productInsight";

type Props = {
  product: ProductAnalysis;
  sessionSignedIn: boolean;
  amazonConnected: boolean;
  onConnectAmazon: () => void;
  /** Server has OPENAI_API_KEY — parent fetches LLM insight. */
  openaiConfigured?: boolean | null;
  llmInsight?: string | null;
  llmLoading?: boolean;
  llmError?: string | null;
};

export function ProductInsightBlurb({
  product,
  sessionSignedIn,
  amazonConnected,
  onConnectAmazon,
  openaiConfigured,
  llmInsight,
  llmLoading,
  llmError,
}: Props) {
  const fallbackText = buildProductInsightMessage(product, { sessionSignedIn, amazonConnected });
  const signIn = showSignInCta(product, { sessionSignedIn, amazonConnected });
  const connect = showConnectAmazonCta(product, { sessionSignedIn, amazonConnected });

  const showLlm = Boolean(openaiConfigured);
  let mainText: string;
  if (showLlm && llmLoading) {
    mainText = "Generating insight…";
  } else if (showLlm && llmInsight) {
    mainText = llmInsight;
  } else if (showLlm && llmError) {
    mainText = fallbackText;
  } else {
    mainText = fallbackText;
  }

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2 text-sm text-slate-300">
      <p>
        <span className="font-semibold text-slate-100">AI: </span>
        <span className={showLlm && llmLoading ? "text-slate-400 animate-pulse" : undefined}>{mainText}</span>
      </p>
      {showLlm && llmError ? (
        <p className="mt-1 text-xs text-amber-200/90" role="status">
          AI unavailable — showing quick summary instead. ({llmError})
        </p>
      ) : null}
      {showLlm && llmInsight && !llmLoading ? (
        <p className="mt-1 text-xs text-slate-500 border-t border-slate-600/80 pt-1.5">{fallbackText}</p>
      ) : null}
      {signIn ? (
        <Link
          href="/login"
          className="mt-2 inline-flex items-center rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
        >
          Sign in
        </Link>
      ) : null}
      {connect ? (
        <button
          type="button"
          onClick={onConnectAmazon}
          className="mt-2 inline-flex items-center rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-teal-500/20 hover:from-teal-400 hover:to-cyan-500"
        >
          Connect Amazon seller account
        </button>
      ) : null}
    </div>
  );
}
