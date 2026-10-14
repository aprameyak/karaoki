import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

const ROUTES = ["", "/features", "/how-it-works", "/pricing", "/faq", "/contact", "/privacy", "/terms", "/copyright"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
