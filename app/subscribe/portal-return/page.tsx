"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Stripe Customer Portal redirects here after the customer is done (subscribe / cancel / payment method).
 * When the portal was opened in a popup, we refresh the opener and close this window.
 */
export default function BillingPortalReturnPage() {
  const [hint, setHint] = useState("Refreshing your account and closing this window…");

  useEffect(() => {
    try {
      const opener = window.opener;
      if (opener && !opener.closed) {
        opener.location.href = `${window.location.origin}/subscribe`;
      }
    } catch {
      // ignore
    }
    try {
      window.close();
    } catch {
      // ignore
    }
    const t = window.setTimeout(() => {
      setHint("You can close this tab if it is still open, then return to the app.");
    }, 600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-900 px-4 text-center text-slate-200">
      <div className="max-w-md rounded-2xl border border-slate-600/80 bg-slate-800/90 p-8 shadow-xl">
        <p className="text-lg font-semibold text-teal-300">Billing updated</p>
        <p className="mt-3 text-sm text-slate-400">{hint}</p>
        <Link
          href="/subscribe"
          className="mt-6 inline-block text-sm font-medium text-teal-400 underline underline-offset-2 hover:text-teal-300"
        >
          Open subscription page
        </Link>
      </div>
    </div>
  );
}
