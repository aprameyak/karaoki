export interface LyricLine {
  time: number | null;
  text: string;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  synced: boolean;
  offsetMs: number;
}

const TIME = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const TAG = /^\[(?:ar|ti|al|au|by|re|ve|length|id):.*\]$/i;
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]$/i;
const WORD_TIME = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;

export function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  const frac = fraction ? Number(`0.${fraction}`) : 0;
  return Number(minutes) * 60 + Number(seconds) + frac;
}

export function parseLrc(input: string): ParsedLyrics {
  const lines: LyricLine[] = [];
  let offsetMs = 0;
  let synced = false;

  for (const raw of input.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const offset = OFFSET.exec(line);
    if (offset) {
      offsetMs = Math.max(-30000, Math.min(30000, Number(offset[1])));
      continue;
    }
    if (TAG.test(line)) continue;

    const stamps = [...line.matchAll(TIME)];
    if (stamps.length === 0) {
      lines.push({ time: null, text: line.replace(WORD_TIME, "").trim() });
      continue;
    }
    synced = true;
    const text = line.replace(TIME, "").replace(WORD_TIME, "").trim();
    for (const stamp of stamps) {
      lines.push({ time: toSeconds(stamp[1] ?? "0", stamp[2] ?? "0", stamp[3]), text });
    }
  }

  if (synced) {
    const timed = lines.filter((entry) => entry.time !== null);
    timed.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    return { lines: timed, synced: true, offsetMs };
  }
  while (lines.length > 0 && lines[lines.length - 1]?.text === "") lines.pop();
  return { lines, synced: false, offsetMs };
}

export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const hundredths = Math.min(99, Math.round((rest - whole) * 100));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `[${pad(minutes)}:${pad(whole)}.${pad(hundredths)}]`;
}

export function activeIndex(lines: LyricLine[], current: number, offsetMs: number): number {
  const position = current + offsetMs / 1000;
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    const time = lines[i]?.time;
    if (time === null || time === undefined) return -1;
    if (time <= position) found = i;
    else break;
  }
  return found;
}

export function stampLine(text: string, caret: number, seconds: number): { text: string; caret: number } {
  const start = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const nextBreak = text.indexOf("\n", start);
  const end = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(start, end);
  const stripped = line.replace(/^(\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/, "").trimStart();
  const stamped = `${formatTimestamp(seconds)}${stripped}`;
  const next = text.slice(0, start) + stamped + text.slice(end);
  const lineEnd = start + stamped.length;
  const after = next.indexOf("\n", lineEnd);
  return { text: next, caret: after === -1 ? lineEnd : after + 1 };
}

export function lyricsFromText(content: string): { synced: boolean; lines: LyricLine[] } {
  const parsed = parseLrc(content);
  return { synced: parsed.synced, lines: parsed.lines };
}
