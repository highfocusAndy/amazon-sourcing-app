"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function BillingContent() {
  const sp = useSearchParams();
  const plan = sp.get("plan") === "pro" ? "pro" : "starter";
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/billing/checkout-guest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    })
      .then((res) => res.json())
      .then((data: { url?: string; error?: string }) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error ?? "Could not start checkout. Please try again.");
        }
      })
      .catch(() => setError("Network error. Please try again."));
  }, [plan]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4" style={{ background: "#020202", color: "#f1f5f9" }}>
        <p className="max-w-sm rounded-xl border border-red-500/30 bg-red-950/30 px-5 py-4 text-center text-sm text-red-300">
          {error}
        </p>
        <Link
          href="/#pricing"
          className="text-sm font-medium underline"
          style={{ color: "#C9A84C" }}
        >
          ← Back to pricing
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4" style={{ background: "#020202", color: "#f1f5f9" }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#C9A84C]" />
      <p className="text-sm text-slate-400">Setting up your free trial…</p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#020202" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-[#C9A84C]" />
      </div>
    }>
      <BillingContent />
    </Suspense>
  );
}
