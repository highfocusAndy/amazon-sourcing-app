import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/lib/publicSiteUrl";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin().origin;
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
