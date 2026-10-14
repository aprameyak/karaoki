import { ALLOWED_EXTENSIONS, type AllowedExtension } from "@karaoki/shared";

export function extensionOf(filename: string): AllowedExtension | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? (ext as AllowedExtension) : null;
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, 180 - ext.length)}${ext}`;
}

export function titleFromFilename(filename: string): string {
  const base = sanitizeFilename(filename);
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const title = stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return (title || "Untitled").slice(0, 200);
}

export interface UploadCheck {
  ok: boolean;
  error?: string;
}

export function checkUpload(filename: string, size: number, maxBytes: number): UploadCheck {
  if (!extensionOf(filename)) {
    return { ok: false, error: "Choose an MP3, WAV, M4A or FLAC file." };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (size > maxBytes) {
    return { ok: false, error: `That file is larger than your plan allows (${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }
  return { ok: true };
}

export function originalPath(userId: string, songId: string, ext: AllowedExtension): string {
  return `${userId}/${songId}/original.${ext}`;
}

export class UploadAborted extends Error {}

export type Attempt = (onProgress: (fraction: number) => void) => Promise<void>;

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
}

export async function withRetry(
  attempt: Attempt,
  onProgress: (fraction: number) => void,
  options: RetryOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 800;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const shouldRetry = options.shouldRetry ?? ((error) => !(error instanceof UploadAborted));
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      onProgress(0);
      await attempt(onProgress);
      onProgress(1);
      return;
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || i === attempts - 1) break;
      await sleep(baseDelay * 2 ** i);
    }
  }
  throw lastError;
}

export function putFile(url: string, file: File, signal?: AbortSignal): Attempt {
  return (onProgress) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append("", file);
      xhr.open("PUT", url);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new UploadAborted());
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(form);
    });
}
