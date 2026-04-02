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
};

export function ProductInsightBlurb({ product, sessionSignedIn, amazonConnected, onConnectAmazon }: Props) {
  const text = buildProductInsightMessage(product, { sessionSignedIn, amazonConnected });
  const signIn = showSignInCta(product, { sessionSignedIn, amazonConnected });
  const connect = showConnectAmazonCta(product, { sessionSignedIn, amazonConnected });

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-700/30 px-3 py-2 text-sm text-slate-300">
      <p>
        <span className="font-semibold text-slate-100">AI: </span>
        {text}
      </p>
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
