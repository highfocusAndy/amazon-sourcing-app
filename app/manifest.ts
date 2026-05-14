import type { MetadataRoute } from "next";

import { appDisplayName, appShortName } from "@/lib/appBranding";

const description =
  "Amazon wholesale & FBA research — catalog, keyword search, analyzer, and seller tools.";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: appDisplayName,
    short_name: appShortName,
    description,
    lang: "en",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["business", "finance", "utilities"],
    icons: [
      {
        src: "/api/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/api/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
