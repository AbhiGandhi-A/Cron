import type { MetadataRoute } from "next";
import { PROD_URL } from "@/lib/site";

const SITE_URL = PROD_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const publicRoutes = [
    { path: "/", lastModified: now, changeFrequency: "daily", priority: 1 },
    { path: "/about", lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { path: "/contact", lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { path: "/privacy", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { path: "/cookie-policy", lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ] as const;

  return publicRoutes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}