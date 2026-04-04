import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/lib/publicSiteUrl";

/** Public routes (same paths as middleware `isPublicPage` + marketing entry points). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteOrigin().origin;
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified },
    { url: `${base}/login`, lastModified },
    { url: `${base}/get-access`, lastModified },
    { url: `${base}/signup`, lastModified },
    { url: `${base}/reset-password`, lastModified },
  ];
}
