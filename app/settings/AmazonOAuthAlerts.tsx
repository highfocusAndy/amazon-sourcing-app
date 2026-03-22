"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AmazonOAuthAlerts() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("amazon_connected");
  const err = searchParams.get("amazon_error");
  const alertKey = `${connected ?? ""}|${err ?? ""}`;

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (alertKey === "|" || dismissedKey === alertKey) {
    return null;
  }

  if (connected === "1") {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span>Amazon seller account connected. SP-API calls will use your authorization.</span>
          <button
            type="button"
            onClick={() => setDismissedKey(alertKey)}
            className="shrink-0 rounded-lg px-2 py-1 text-emerald-800 hover:bg-emerald-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span>{err}</span>
          <button
            type="button"
            onClick={() => setDismissedKey(alertKey)}
            className="shrink-0 rounded-lg px-2 py-1 text-red-800 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
