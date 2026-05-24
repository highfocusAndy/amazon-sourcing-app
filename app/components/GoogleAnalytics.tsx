"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !window.gtag) return;
    window.gtag("config", GA_MEASUREMENT_ID, { page_path: pathname });
  }, [pathname]);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { page_path: window.location.pathname });
        `}
      </Script>
    </>
  );
}
