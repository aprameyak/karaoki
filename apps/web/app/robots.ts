import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api/", "/auth/", "/login", "/signup", "/forgot-password", "/reset-password"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
