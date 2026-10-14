export const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

export type TakeExtension = "webm" | "ogg" | "m4a" | "wav";

export function pickMimeType(isSupported: (type: string) => boolean): string | null {
  return MIME_CANDIDATES.find((type) => isSupported(type)) ?? null;
}

export function extensionForMime(mime: string): TakeExtension {
  const type = mime.toLowerCase();
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("aac")) return "m4a";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export function rmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 2.5);
}

export function defaultOffsetMs(baseLatency: number | undefined, outputLatency: number | undefined): number {
  const seconds = (baseLatency ?? 0) + (outputLatency ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return -Math.min(500, Math.round(seconds * 1000));
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
