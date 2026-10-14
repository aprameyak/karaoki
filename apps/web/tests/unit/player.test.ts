import { describe, expect, it } from "vitest";
import {
  SPEEDS,
  actionForKey,
  availableStems,
  isTypingTarget,
  ratioToTime,
  seekTarget,
  stemForShortcut,
  stepSpeed,
  timeToRatio,
} from "@/lib/player";

describe("actionForKey", () => {
  it("maps the documented shortcuts", () => {
    expect(actionForKey(" ")).toEqual({ type: "toggle" });
    expect(actionForKey("k")).toEqual({ type: "toggle" });
    expect(actionForKey("ArrowLeft")).toEqual({ type: "seek", delta: -5 });
    expect(actionForKey("ArrowRight")).toEqual({ type: "seek", delta: 5 });
    expect(actionForKey("j")).toEqual({ type: "seek", delta: -10 });
    expect(actionForKey("l")).toEqual({ type: "seek", delta: 10 });
    expect(actionForKey("ArrowUp")).toEqual({ type: "volume", delta: 0.05 });
    expect(actionForKey("ArrowDown")).toEqual({ type: "volume", delta: -0.05 });
    expect(actionForKey("m")).toEqual({ type: "mute" });
    expect(actionForKey("1")).toEqual({ type: "stem", stem: "instrumental" });
    expect(actionForKey("2")).toEqual({ type: "stem", stem: "vocals" });
    expect(actionForKey("3")).toEqual({ type: "stem", stem: "original" });
    expect(actionForKey("]")).toEqual({ type: "speed", direction: 1 });
    expect(actionForKey("[")).toEqual({ type: "speed", direction: -1 });
    expect(actionForKey("0")).toEqual({ type: "restart" });
    expect(actionForKey("Home")).toEqual({ type: "restart" });
  });

  it("ignores other keys", () => {
    expect(actionForKey("a")).toBeNull();
    expect(actionForKey("Enter")).toBeNull();
    expect(actionForKey("Tab")).toBeNull();
  });
});

describe("seeking", () => {
  it("keeps the target inside the song", () => {
    expect(seekTarget(10, 5, 100)).toBe(15);
    expect(seekTarget(2, -5, 100)).toBe(0);
    expect(seekTarget(98, 5, 100)).toBe(100);
    expect(seekTarget(5, 5, 0)).toBe(0);
  });

  it("converts between ratios and times", () => {
    expect(ratioToTime(0.5, 200)).toBe(100);
    expect(ratioToTime(-1, 200)).toBe(0);
    expect(ratioToTime(2, 200)).toBe(200);
    expect(timeToRatio(50, 200)).toBe(0.25);
    expect(timeToRatio(50, 0)).toBe(0);
    expect(timeToRatio(500, 200)).toBe(1);
  });
});

describe("stepSpeed", () => {
  it("moves through the available speeds", () => {
    expect(stepSpeed(1, 1)).toBe(1.1);
    expect(stepSpeed(1, -1)).toBe(0.9);
  });

  it("stops at the ends", () => {
    expect(stepSpeed(SPEEDS[0], -1)).toBe(SPEEDS[0]);
    expect(stepSpeed(SPEEDS[SPEEDS.length - 1] as number, 1)).toBe(SPEEDS[SPEEDS.length - 1]);
  });

  it("recovers from values outside the list", () => {
    expect(SPEEDS).toContain(stepSpeed(1.07, 1));
  });
});

describe("stems", () => {
  const urls = { instrumental: "a", vocals: null, original: "c" };
  it("lists only stems that exist", () => {
    expect(availableStems(urls)).toEqual(["instrumental", "original"]);
  });

  it("only switches to stems that exist", () => {
    expect(stemForShortcut("instrumental", urls)).toBe("instrumental");
    expect(stemForShortcut("vocals", urls)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("detects form fields", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
