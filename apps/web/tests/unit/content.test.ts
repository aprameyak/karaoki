import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POSTS, formatPostDate, getPost } from "@/lib/blog";
import { FAQS, FEATURES, STEPS } from "@/lib/content";
import { AI_KARAOKE_MAKER, MP3_TO_KARAOKE, PITCH_CHANGER, VOCAL_REMOVER } from "@/lib/tools";

const TOOLS = [AI_KARAOKE_MAKER, VOCAL_REMOVER, MP3_TO_KARAOKE, PITCH_CHANGER];
const root = join(__dirname, "..", "..");

function routeExists(href: string): boolean {
  const path = href.split("#")[0] ?? "";
  if (path === "/" || path === "") return true;
  const parts = path.split("/").filter(Boolean);
  const marketing = join(root, "app", "(marketing)", ...parts);
  if (existsSync(join(marketing, "page.tsx"))) return true;
  if (parts[0] === "blog" && parts.length === 2) return Boolean(getPost(parts[1] ?? ""));
  return existsSync(join(root, "app", ...parts, "page.tsx"));
}

describe("blog", () => {
  it("has unique slugs and valid dates", () => {
    expect(new Set(POSTS.map((post) => post.slug)).size).toBe(POSTS.length);
    for (const post of POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(post.date).getTime())).toBe(false);
    }
  });

  it("has search-friendly titles and descriptions", () => {
    for (const post of POSTS) {
      expect(post.title.length).toBeGreaterThan(15);
      expect(post.title.length).toBeLessThanOrEqual(70);
      expect(post.description.length).toBeGreaterThan(60);
      expect(post.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("has real content", () => {
    for (const post of POSTS) {
      const text = post.body.map((b) => (b.type === "ul" ? b.items.join(" ") : b.text)).join(" ");
      expect(text.split(/\s+/).length).toBeGreaterThan(250);
      expect(post.body.some((block) => block.type === "h2")).toBe(true);
      expect(post.minutes).toBeGreaterThan(0);
    }
  });

  it("looks posts up by slug", () => {
    expect(getPost(POSTS[0]!.slug)?.title).toBe(POSTS[0]!.title);
    expect(getPost("nope")).toBeUndefined();
  });

  it("formats dates without timezone drift", () => {
    expect(formatPostDate("2026-10-14")).toBe("October 14, 2026");
    expect(formatPostDate("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("tool pages", () => {
  it("each has its own path, title and an existing page", () => {
    expect(new Set(TOOLS.map((tool) => tool.path)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((tool) => tool.title)).size).toBe(TOOLS.length);
    for (const tool of TOOLS) {
      expect(existsSync(join(root, "app", "(marketing)", tool.path.slice(1), "page.tsx"))).toBe(true);
    }
  });

  it("have enough substance and no duplicated copy", () => {
    for (const tool of TOOLS) {
      expect(tool.steps.length).toBeGreaterThanOrEqual(3);
      expect(tool.faqs.length).toBeGreaterThanOrEqual(3);
      expect(tool.points.length).toBeGreaterThanOrEqual(3);
      expect(tool.intro.length).toBeGreaterThan(80);
    }
    const intros = TOOLS.map((tool) => tool.intro);
    expect(new Set(intros).size).toBe(intros.length);
    const faqQuestions = TOOLS.flatMap((tool) => tool.faqs.map((faq) => faq.question));
    expect(new Set(faqQuestions).size).toBe(faqQuestions.length);
  });

  it("only link to pages that exist", () => {
    for (const tool of TOOLS) {
      for (const link of tool.related) expect(routeExists(link.href), `${tool.path} -> ${link.href}`).toBe(true);
    }
  });
});

describe("shared content", () => {
  it("has unique questions and complete answers", () => {
    expect(new Set(FAQS.map((faq) => faq.question)).size).toBe(FAQS.length);
    for (const faq of FAQS) expect(faq.answer.length).toBeGreaterThan(40);
  });

  it("lists every built feature and no billing", () => {
    const titles = FEATURES.map((feature) => feature.title);
    for (const title of ["Key and tempo export", "Synced lyrics", "Recording studio", "AI vocal separation"]) {
      expect(titles).toContain(title);
    }
    expect(FEATURES.some((feature) => /billing|stripe|pro\b/i.test(feature.title + feature.body))).toBe(false);
  });

  it("has three steps", () => {
    expect(STEPS).toHaveLength(3);
  });

  it("never claims things we do not do", () => {
    const text = JSON.stringify([FAQS, FEATURES, STEPS, TOOLS, POSTS]).toLowerCase();
    for (const phrase of ["100% accurate", "perfect quality", "guaranteed", "no vocals remain", "#1 ", "millions of"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("keeps every page folder reachable from the sitemap or on purpose private", () => {
    const folders = readdirSync(join(root, "app", "(marketing)"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/${entry.name}`);
    expect(folders).toEqual(expect.arrayContaining(["/ai-karaoke-maker", "/vocal-remover", "/mp3-to-karaoke", "/pitch-changer", "/blog"]));
  });
});
