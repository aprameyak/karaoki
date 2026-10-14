import { clamp } from "@/lib/utils";

export type Stem = "instrumental" | "vocals" | "original";

export const STEM_LABELS: Record<Stem, string> = {
  instrumental: "Instrumental",
  vocals: "Vocals",
  original: "Original",
};

export const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;

export type KeyAction =
  | { type: "toggle" }
  | { type: "seek"; delta: number }
  | { type: "volume"; delta: number }
  | { type: "mute" }
  | { type: "stem"; stem: Stem }
  | { type: "speed"; direction: 1 | -1 }
  | { type: "restart" };

export function actionForKey(key: string): KeyAction | null {
  switch (key) {
    case " ":
    case "k":
      return { type: "toggle" };
    case "ArrowLeft":
      return { type: "seek", delta: -5 };
    case "ArrowRight":
      return { type: "seek", delta: 5 };
    case "j":
      return { type: "seek", delta: -10 };
    case "l":
      return { type: "seek", delta: 10 };
    case "ArrowUp":
      return { type: "volume", delta: 0.05 };
    case "ArrowDown":
      return { type: "volume", delta: -0.05 };
    case "m":
      return { type: "mute" };
    case "1":
      return { type: "stem", stem: "instrumental" };
    case "2":
      return { type: "stem", stem: "vocals" };
    case "3":
      return { type: "stem", stem: "original" };
    case "]":
      return { type: "speed", direction: 1 };
    case "[":
      return { type: "speed", direction: -1 };
    case "0":
    case "Home":
      return { type: "restart" };
    default:
      return null;
  }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target as HTMLElement).tagName) return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}

export function seekTarget(current: number, delta: number, duration: number): number {
  return clamp(current + delta, 0, Math.max(duration, 0));
}

export function ratioToTime(ratio: number, duration: number): number {
  return clamp(ratio, 0, 1) * Math.max(duration, 0);
}

export function timeToRatio(time: number, duration: number): number {
  return duration > 0 ? clamp(time / duration, 0, 1) : 0;
}

export function stepSpeed(current: number, direction: 1 | -1): number {
  const index = SPEEDS.findIndex((speed) => speed >= current - 1e-9);
  const from = index === -1 ? SPEEDS.length - 1 : index;
  return SPEEDS[clamp(from + direction, 0, SPEEDS.length - 1)] ?? 1;
}

export function availableStems(urls: Record<Stem, string | null>): Stem[] {
  return (Object.keys(STEM_LABELS) as Stem[]).filter((stem) => Boolean(urls[stem]));
}

export function stemForShortcut(stem: Stem, urls: Record<Stem, string | null>): Stem | null {
  return urls[stem] ? stem : null;
}
