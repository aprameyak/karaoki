import { describe, expect, it } from "vitest";
import { activeIndex, formatTimestamp, parseLrc, stampLine } from "@/lib/lrc";

describe("parseLrc", () => {
  it("parses timestamped lines and sorts them", () => {
    const result = parseLrc("[00:12.50]Second\n[00:05.00]First\n[01:02.25]Third");
    expect(result.synced).toBe(true);
    expect(result.lines).toEqual([
      { time: 5, text: "First" },
      { time: 12.5, text: "Second" },
      { time: 62.25, text: "Third" },
    ]);
  });

  it("supports several timestamps on one line and different precisions", () => {
    const result = parseLrc("[00:10][00:20.5][00:30.125]Chorus");
    expect(result.lines.map((line) => line.time)).toEqual([10, 20.5, 30.125]);
    expect(result.lines.every((line) => line.text === "Chorus")).toBe(true);
  });

  it("ignores metadata tags and reads the offset", () => {
    const result = parseLrc("[ar:Someone]\n[ti:Song]\n[offset:+500]\n[00:01.00]Hi");
    expect(result.offsetMs).toBe(500);
    expect(result.lines).toEqual([{ time: 1, text: "Hi" }]);
  });

  it("strips word timestamps", () => {
    expect(parseLrc("[00:01.00]<00:01.00>Hel<00:01.40>lo").lines[0]?.text).toBe("Hello");
  });

  it("keeps blank timestamped lines for instrumental breaks", () => {
    const result = parseLrc("[00:01.00]Line\n[00:05.00]\n[00:09.00]Next");
    expect(result.lines.map((line) => line.text)).toEqual(["Line", "", "Next"]);
  });

  it("treats text without timestamps as plain lyrics", () => {
    const result = parseLrc("Line one\r\nLine two\n\n");
    expect(result.synced).toBe(false);
    expect(result.lines).toEqual([
      { time: null, text: "Line one" },
      { time: null, text: "Line two" },
    ]);
  });

  it("handles empty input", () => {
    expect(parseLrc("")).toEqual({ lines: [], synced: false, offsetMs: 0 });
  });

  it("clamps an absurd offset", () => {
    expect(parseLrc("[offset:999999]\n[00:01.00]x").offsetMs).toBe(30000);
  });
});

describe("formatTimestamp", () => {
  it("formats minutes, seconds and hundredths", () => {
    expect(formatTimestamp(0)).toBe("[00:00.00]");
    expect(formatTimestamp(65.5)).toBe("[01:05.50]");
    expect(formatTimestamp(599.999)).toBe("[09:59.99]");
    expect(formatTimestamp(-4)).toBe("[00:00.00]");
  });

  it("round-trips through the parser", () => {
    const seconds = 125.37;
    expect(parseLrc(`${formatTimestamp(seconds)}x`).lines[0]?.time).toBeCloseTo(seconds, 2);
  });
});

describe("activeIndex", () => {
  const lines = [
    { time: 5, text: "a" },
    { time: 10, text: "b" },
    { time: 15, text: "c" },
  ];

  it("finds the current line", () => {
    expect(activeIndex(lines, 0, 0)).toBe(-1);
    expect(activeIndex(lines, 5, 0)).toBe(0);
    expect(activeIndex(lines, 12, 0)).toBe(1);
    expect(activeIndex(lines, 99, 0)).toBe(2);
  });

  it("applies the manual offset", () => {
    expect(activeIndex(lines, 4, 1500)).toBe(0);
    expect(activeIndex(lines, 11, -2000)).toBe(0);
  });

  it("returns nothing for unsynced lyrics", () => {
    expect(activeIndex([{ time: null, text: "x" }], 10, 0)).toBe(-1);
  });
});

describe("stampLine", () => {
  it("adds a timestamp to the line at the caret", () => {
    const result = stampLine("first\nsecond\nthird", 8, 12.5);
    expect(result.text).toBe("first\n[00:12.50]second\nthird");
  });

  it("replaces an existing timestamp", () => {
    const result = stampLine("[00:01.00]hello\n[00:02.00]there", 3, 7);
    expect(result.text).toBe("[00:07.00]hello\n[00:02.00]there");
  });

  it("moves the caret to the start of the next line", () => {
    const result = stampLine("a\nb\nc", 0, 1);
    expect(result.text.slice(result.caret).startsWith("b")).toBe(true);
  });

  it("works on the last line and on empty text", () => {
    expect(stampLine("a\nb", 3, 3).text).toBe("a\n[00:03.00]b");
    expect(stampLine("", 0, 2).text).toBe("[00:02.00]");
  });
});
