"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function AmazonOAuthAlerts() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const connected = searchParams.get("amazon_connected");
  const err = searchParams.get("amazon_error");
  const alertKey = `${connected ?? ""}|${err ?? ""}`;

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // Success should be silent: strip amazon_connected from the URL.
  useEffect(() => {
    if (connected !== "1") return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("amazon_connected");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [connected, pathname, router, searchParams]);

  if (alertKey === "|" || dismissedKey === alertKey) {
    return null;
  }

  if (connected === "1") {
    return null;
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
