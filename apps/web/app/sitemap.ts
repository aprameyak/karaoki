import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/blog";
import { siteUrl } from "@/lib/env";

const ROUTES = [
  "",
  "/features",
  "/how-it-works",
  "/pricing",
  "/ai-karaoke-maker",
  "/vocal-remover",
  "/mp3-to-karaoke",
  "/pitch-changer",
  "/blog",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/copyright",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages = ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: (path === "" ? "weekly" : "monthly") as "weekly" | "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
  const posts = POSTS.map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T12:00:00Z`),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));
  return [...pages, ...posts];
}
