import { describe, expect, it } from "vitest";
import { clamp, formatBytes, formatDuration, timeAgo } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats common sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatBytes(20 * 1024 ** 3)).toBe("20 GB");
  });

  it("handles bad input", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65.9)).toBe("1:05");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3725)).toBe("1:02:05");
  });

  it("handles missing values", () => {
    expect(formatDuration(null)).toBe("0:00");
    expect(formatDuration(undefined)).toBe("0:00");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("clamp", () => {
  it("keeps values in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("describes recent times", () => {
    expect(timeAgo("2026-10-13T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-13T11:30:00Z", now)).toBe("30 min ago");
    expect(timeAgo("2026-10-13T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-10-10T12:00:00Z", now)).toBe("3 d ago");
  });

  it("falls back to a date for old items", () => {
    expect(timeAgo("2026-01-05T12:00:00Z", now)).toMatch(/2026/);
  });
});
