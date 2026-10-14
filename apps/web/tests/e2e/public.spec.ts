import { expect, test, type Page } from "@playwright/test";

function alerts(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

async function open(page: Page, path: string) {
  const res = await page.goto(path);
  await page.waitForLoadState("networkidle");
  return res;
}

test.describe("landing page", () => {
  test("shows the headline, calls to action and navigation", async ({ page }) => {
    await open(page, "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn Any Song Into Your Stage.");
    await expect(page.getByRole("link", { name: "Create Karaoke Free" }).first()).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "See How It Works" })).toHaveAttribute("href", "/how-it-works");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pricing" })).toBeVisible();
    await expect(page.getByText("Your Music. Your Voice. Your Stage.")).toBeVisible();
  });

  test("has the expected page metadata", async ({ page }) => {
    await open(page, "/");
    await expect(page).toHaveTitle(/Karaoki/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^http:\/\/localhost:3100\/?$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /karaoke/i);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(jsonLd ?? "{}");
    const types = (data["@graph"] as { "@type": string }[]).map((item) => item["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "SoftwareApplication", "FAQPage"]));
  });

  test("accepts a supported audio file in the upload teaser", async ({ page }) => {
    await open(page, "/");
    await page.getByLabel("Choose an audio file").setInputFiles({
      name: "my song.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.alloc(2048, 1),
    });
    await expect(page.getByText("my song.mp3")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create karaoke free", exact: true })).toHaveAttribute(
      "href",
      "/signup?next=/dashboard/upload",
    );
  });

  test("rejects an unsupported file", async ({ page }) => {
    await open(page, "/");
    await page.getByLabel("Choose an audio file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await expect(alerts(page)).toContainText("MP3, WAV, M4A or FLAC");
    await expect(page.getByRole("link", { name: "Create karaoke free", exact: true })).toHaveCount(0);
  });

  test("lets you switch between the demo versions", async ({ page }) => {
    await open(page, "/");
    const before = page.getByRole("tab", { name: /Before/ });
    const after = page.getByRole("tab", { name: /After/ });
    await expect(before).toHaveAttribute("aria-selected", "true");
    await after.click();
    await expect(after).toHaveAttribute("aria-selected", "true");
    await expect(before).toHaveAttribute("aria-selected", "false");
  });

  test("serves the demo audio files", async ({ request }) => {
    for (const file of ["before-full-mix.mp3", "after-instrumental.mp3"]) {
      const res = await request.get(`/demo/${file}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("audio");
      expect((await res.body()).byteLength).toBeGreaterThan(10_000);
    }
  });
});

test.describe("public pages", () => {
  for (const [path, heading] of [
    ["/features", "Features"],
    ["/pricing", "Karaoki is free"],
    ["/how-it-works", "How it works"],
    ["/faq", "Frequently asked questions"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
    ["/copyright", "Copyright and takedowns"],
    ["/contact", "Contact"],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    });
  }

  test("pricing says Karaoki is free and has no paid plan", async ({ page }) => {
    await open(page, "/pricing");
    await expect(page.getByRole("heading", { name: "Free for everyone" })).toBeVisible();
    await expect(page.getByText("$0")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["pro plan", "billing", "subscription price", "upgrade", "checkout"]) {
      expect(text).not.toContain(word);
    }
  });

  test("faq answers expand", async ({ page }) => {
    await page.goto("/faq");
    const item = page.locator("details").filter({ hasText: "Are my uploads private?" });
    await expect(item).not.toHaveAttribute("open", "");
    await item.locator("summary").click();
    await expect(item).toHaveAttribute("open", "");
    await expect(item).toContainText("private storage");
  });

  test("legal drafts are labeled as drafts", async ({ page }) => {
    for (const path of ["/privacy", "/terms", "/copyright"]) {
      await page.goto(path);
      await expect(page.getByText("draft prepared for legal review")).toBeVisible();
    }
  });

  test("the copyright form requires the statement", async ({ page }) => {
    await open(page, "/copyright");
    await page.getByLabel("Your name").fill("Owner");
    await page.getByLabel("Your email").fill("owner@example.com");
    await page.getByLabel("The copyrighted work").fill("My song called Example");
    await page.getByLabel("Where it appears on Karaoki").fill("A track named Example");
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Thank you")).toHaveCount(0);
  });

  test("unknown routes show the not found page", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  });
});

test.describe("tool pages and blog", () => {
  for (const [path, heading] of [
    ["/ai-karaoke-maker", "AI karaoke maker"],
    ["/vocal-remover", "Online vocal remover"],
    ["/mp3-to-karaoke", "Convert an MP3 to a karaoke track"],
    ["/pitch-changer", "Change a song's key without changing its speed"],
  ] as const) {
    test(`${path} has its own content and structured data`, async ({ page }) => {
      const res = await open(page, path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
      await expect(page.getByRole("link", { name: "Try it free" })).toHaveAttribute("href", "/signup");
      const data = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
      const types = (data["@graph"] as { "@type": string }[]).map((item) => item["@type"]);
      expect(types).toEqual(expect.arrayContaining(["HowTo", "FAQPage"]));
      expect(await page.locator("h1").count()).toBe(1);
    });
  }

  test("the blog lists every article and each one opens", async ({ page }) => {
    await open(page, "/blog");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blog");
    const links = page.locator("article h2 a");
    expect(await links.count()).toBe(3);
    await links.first().click();
    await expect(page).toHaveURL(/\/blog\//);
    await expect(page.locator("article h1")).toBeVisible();
    const data = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}");
    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBeTruthy();
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  });

  test("an unknown article is a 404", async ({ page }) => {
    const res = await page.goto("/blog/not-a-real-article");
    expect(res?.status()).toBe(404);
  });

  test("the footer links to the tools and the blog", async ({ page }) => {
    await open(page, "/");
    const footer = page.getByRole("contentinfo");
    for (const name of ["AI karaoke maker", "Vocal remover", "MP3 to karaoke", "Pitch changer", "Blog"]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }
  });

  test("the contact form needs a real message", async ({ page }) => {
    await open(page, "/contact");
    await page.getByLabel("Your name").fill("Sam");
    await page.getByLabel("Your email").fill("sam@example.com");
    await page.getByLabel("How can we help?").fill("short");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Thanks, your message was sent")).toHaveCount(0);
  });

  test("the sitemap lists the tools and articles", async ({ request }) => {
    const text = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/ai-karaoke-maker", "/vocal-remover", "/mp3-to-karaoke", "/pitch-changer", "/blog", "/blog/how-ai-vocal-removal-works"]) {
      expect(text).toContain(path);
    }
  });

  test("tool pages do not overflow on a phone", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
    for (const path of ["/ai-karaoke-maker", "/blog", "/blog/recording-over-a-backing-track", "/pitch-changer"]) {
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("authentication pages", () => {
  test("log in form validates input", async ({ page }) => {
    await open(page, "/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(alerts(page)).toContainText("valid email");
    await page.getByLabel("Email").fill("person@example.com");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(alerts(page)).toContainText("Enter your password");
  });

  test("sign up form validates input", async ({ page }) => {
    await open(page, "/signup");
    await page.getByLabel("Name").fill("Sam");
    await page.getByLabel("Email").fill("sam@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(alerts(page)).toContainText("at least 8 characters");
  });

  test("offers Google sign in and password reset", async ({ page }) => {
    await open(page, "/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  });

  test("unsafe next parameters are ignored", async ({ page }) => {
    await page.goto("/signup?next=//evil.example/steal");
    await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fdashboard");
    await page.goto("/login?next=https://evil.example");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?next=%2Fdashboard",
    );
  });

  test("auth pages are not indexed", async ({ page }) => {
    await open(page, "/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("protected areas", () => {
  test("dashboard and admin pages redirect signed-out visitors to log in", async ({ page }) => {
    for (const path of ["/dashboard", "/dashboard/upload", "/dashboard/library", "/dashboard/settings", "/admin", "/admin/jobs"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
    }
  });

  test("api routes reject signed-out requests", async ({ request }) => {
    const id = "11111111-1111-4111-8111-111111111111";
    const calls = [
      request.post("/api/uploads", { data: { filename: "a.mp3", size: 10, rightsConfirmed: true } }),
      request.post(`/api/songs/${id}/process`),
      request.get(`/api/songs/${id}/media`),
      request.patch(`/api/songs/${id}`, { data: { title: "x" } }),
      request.delete(`/api/songs/${id}`),
      request.get(`/api/jobs/${id}`),
      request.post(`/api/jobs/${id}/cancel`),
      request.post(`/api/jobs/${id}/retry`),
      request.get("/api/account/export"),
      request.delete("/api/account"),
      request.post(`/api/songs/${id}/exports`, { data: { semitones: 1 } }),
      request.get(`/api/exports/${id}`),
      request.delete(`/api/exports/${id}`),
      request.post(`/api/songs/${id}/recordings/upload`, { data: { extension: "webm" } }),
      request.post(`/api/songs/${id}/recordings`, { data: {} }),
      request.get(`/api/recordings/${id}`),
      request.post(`/api/recordings/${id}/remix`, { data: {} }),
      request.delete(`/api/recordings/${id}`),
      request.post(`/api/admin/jobs/${id}/retry`),
      request.post(`/api/admin/reports/${id}`, { data: { status: "open" } }),
      request.post(`/api/admin/support/${id}`, { data: { status: "open" } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status()).toBe(401);
      expect((await res.json()).error.code).toBe("unauthorized");
    }
  });
});

test.describe("seo and security", () => {
  test("sitemap lists the public pages and skips private ones", async ({ request }) => {
    const text = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/pricing", "/faq", "/how-it-works", "/features", "/privacy"]) {
      expect(text).toContain(path);
    }
    expect(text).not.toContain("/dashboard");
    expect(text).not.toContain("/login");
  });

  test("robots.txt blocks private areas and points to the sitemap", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("Disallow: /dashboard");
    expect(text).toContain("Disallow: /api/");
    expect(text).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  test("responses carry security headers", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("microphone=(self)");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the social preview image is generated", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("landing page does not overflow horizontally", async ({ page }) => {
    await open(page, "/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
  });
});
