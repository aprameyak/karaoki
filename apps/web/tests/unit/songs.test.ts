import { describe, expect, it } from "vitest";
import { currentPeriodStart, planFromRow } from "@/lib/account";
import { downloadName } from "@/lib/media";
import { escapeLike, libraryHref, parseLibraryQuery } from "@/lib/songs";
import { allow, resetRateLimits } from "@/lib/rate-limit";
import { describeError } from "@/lib/messages";

describe("parseLibraryQuery", () => {
  it("applies defaults", () => {
    expect(parseLibraryQuery({})).toEqual({ q: "", sort: "new", favorites: false, page: 1 });
  });

  it("reads valid values", () => {
    expect(parseLibraryQuery({ q: "  love ", sort: "title", fav: "1", page: "3" })).toEqual({
      q: "love",
      sort: "title",
      favorites: true,
      page: 3,
    });
  });

  it("repairs invalid values", () => {
    const parsed = parseLibraryQuery({ sort: "drop table", page: "-4", q: "x".repeat(500), fav: "yes" });
    expect(parsed.sort).toBe("new");
    expect(parsed.page).toBe(1);
    expect(parsed.q.length).toBe(100);
    expect(parsed.favorites).toBe(false);
    expect(parseLibraryQuery({ page: "abc" }).page).toBe(1);
    expect(parseLibraryQuery({ page: "99999999" }).page).toBe(10000);
    expect(parseLibraryQuery({ q: ["first", "second"] }).q).toBe("first");
  });
});

describe("escapeLike", () => {
  it("escapes wildcard characters", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("libraryHref", () => {
  const base = { q: "love", sort: "title" as const, favorites: true, page: 2 };
  it("keeps the filters", () => {
    expect(libraryHref(base)).toBe("/dashboard/library?q=love&sort=title&fav=1&page=2");
    expect(libraryHref(base, { page: 3 })).toContain("page=3");
  });

  it("omits defaults", () => {
    expect(libraryHref({ q: "", sort: "new", favorites: false, page: 1 })).toBe("/dashboard/library");
  });

  it("encodes the search text", () => {
    expect(libraryHref({ ...base, q: "a&b=c", favorites: false, page: 1, sort: "new" })).toBe(
      "/dashboard/library?q=a%26b%3Dc",
    );
  });
});

describe("downloadName", () => {
  it("builds a safe filename", () => {
    expect(downloadName("Song", "instrumental", "mp3")).toBe("Song (instrumental).mp3");
    expect(downloadName('a/b\\c:d*e?"f<g>h|i', "vocals", "mp3")).toBe("a b c d e f g h i (vocals).mp3");
    expect(downloadName("   ", "vocals", "mp3")).toBe("song (vocals).mp3");
    expect(downloadName("x".repeat(300), "vocals", "mp3").length).toBeLessThan(120);
  });
});

describe("currentPeriodStart", () => {
  it("uses the first day of the UTC month", () => {
    expect(currentPeriodStart(new Date("2026-10-13T12:00:00Z"))).toBe("2026-10-01");
    expect(currentPeriodStart(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01-01");
    expect(currentPeriodStart(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-01");
  });
});

describe("planFromRow", () => {
  it("falls back to the free plan", () => {
    expect(planFromRow(null).id).toBe("free");
  });

  it("converts database rows", () => {
    const plan = planFromRow({
      id: "pro",
      name: "Pro",
      price_cents: 699,
      monthly_jobs: 100,
      max_storage_bytes: 21474836480,
      max_file_bytes: 209715200,
      max_duration_seconds: 1200,
    });
    expect(plan).toMatchObject({ id: "pro", monthlyJobs: 100, maxFileBytes: 209715200 });
  });
});

describe("rate limiter", () => {
  it("limits within a window and resets after it", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => allow("k", 2, 1000, t0))).toEqual([true, true, false]);
    expect(allow("other", 2, 1000, t0)).toBe(true);
    expect(allow("k", 2, 1000, t0 + 1001)).toBe(true);
  });
});

describe("describeError", () => {
  it("prefers friendly messages", () => {
    expect(describeError("quota_exceeded", "x")).toContain("this month");
    expect(describeError("unknown_code", "fallback")).toBe("fallback");
    expect(describeError(undefined, "fallback")).toBe("fallback");
  });
});
