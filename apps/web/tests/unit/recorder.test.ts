import { describe, expect, it } from "vitest";
import { defaultOffsetMs, extensionForMime, formatElapsed, pickMimeType, rmsLevel } from "@/lib/recorder";

describe("pickMimeType", () => {
  it("prefers webm with opus", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to what the browser supports", () => {
    expect(pickMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
  });

  it("returns null when nothing is supported", () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("maps types to file extensions", () => {
    expect(extensionForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMime("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("audio/wav")).toBe("wav");
    expect(extensionForMime("")).toBe("webm");
  });
});

describe("rmsLevel", () => {
  it("is zero for silence and empty input", () => {
    expect(rmsLevel(new Uint8Array(128).fill(128))).toBe(0);
    expect(rmsLevel(new Uint8Array(0))).toBe(0);
  });

  it("grows with loudness and never exceeds one", () => {
    const quiet = new Uint8Array(128).map((_, i) => (i % 2 === 0 ? 132 : 124));
    const loud = new Uint8Array(128).map((_, i) => (i % 2 === 0 ? 255 : 0));
    expect(rmsLevel(quiet)).toBeGreaterThan(0);
    expect(rmsLevel(loud)).toBeGreaterThan(rmsLevel(quiet));
    expect(rmsLevel(loud)).toBeLessThanOrEqual(1);
  });
});

describe("defaultOffsetMs", () => {
  it("compensates for output latency", () => {
    expect(defaultOffsetMs(0.01, 0.04)).toBe(-50);
  });

  it("handles missing and absurd values", () => {
    expect(defaultOffsetMs(undefined, undefined)).toBe(0);
    expect(defaultOffsetMs(Number.NaN, 0.1)).toBe(0);
    expect(defaultOffsetMs(2, 2)).toBe(-500);
  });
});

describe("formatElapsed", () => {
  it("formats minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(75_400)).toBe("1:15");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
