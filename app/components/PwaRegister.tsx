"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js in production so Android Chrome can offer install / Add to Home Screen as a PWA.
 * Avoids caching surprises during `next dev`.
 */
export function PwaRegister(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
