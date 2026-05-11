"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Strips Amazon OAuth callback query params from the URL with no UI.
 * (OAuth errors were previously shown in a banner; we only clean the address bar now.)
 */
export function AmazonOAuthQueryCleanup() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("amazon_connected");
    const err = searchParams.get("amazon_error");
    if (connected !== "1" && !err) return;

    const next = new URLSearchParams(searchParams.toString());
    if (connected === "1") next.delete("amazon_connected");
    if (err) next.delete("amazon_error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  return null;
}
