import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/lib/publicSiteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteOrigin().origin;
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/register`, lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
