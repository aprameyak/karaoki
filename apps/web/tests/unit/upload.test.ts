import { describe, expect, it, vi } from "vitest";
import {
  UploadAborted,
  checkUpload,
  extensionOf,
  originalPath,
  sanitizeFilename,
  titleFromFilename,
  withRetry,
} from "@/lib/upload";

describe("extensionOf", () => {
  it("accepts supported audio types in any case", () => {
    expect(extensionOf("a.mp3")).toBe("mp3");
    expect(extensionOf("A.WAV")).toBe("wav");
    expect(extensionOf("my.song.m4a")).toBe("m4a");
    expect(extensionOf("x.FLAC")).toBe("flac");
  });

  it("rejects everything else", () => {
    expect(extensionOf("song.ogg")).toBeNull();
    expect(extensionOf("virus.exe")).toBeNull();
    expect(extensionOf("mp3")).toBeNull();
    expect(extensionOf("")).toBeNull();
    expect(extensionOf("song.mp3.exe")).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("strips paths and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd.mp3")).toBe("passwd.mp3");
    expect(sanitizeFilename("C:\\music\\song.mp3")).toBe("song.mp3");
    expect(sanitizeFilename("a\u0000b\u001f.mp3")).toBe("ab.mp3");
    expect(sanitizeFilename("  spaced   out .mp3 ")).toBe("spaced out .mp3");
  });

  it("limits the length but keeps the extension", () => {
    const result = sanitizeFilename("x".repeat(500) + ".mp3");
    expect(result.length).toBe(180);
    expect(result.endsWith(".mp3")).toBe(true);
    expect(extensionOf(result)).toBe("mp3");
  });
});

describe("titleFromFilename", () => {
  it("builds a readable title", () => {
    expect(titleFromFilename("my_favorite_song.mp3")).toBe("my favorite song");
    expect(titleFromFilename("Artist - Title.flac")).toBe("Artist - Title");
    expect(titleFromFilename(".mp3")).toBe(".mp3");
    expect(titleFromFilename("")).toBe("Untitled");
    expect(titleFromFilename("a".repeat(400) + ".mp3").length).toBeLessThanOrEqual(200);
  });
});

describe("checkUpload", () => {
  const max = 50 * 1024 * 1024;
  it("accepts valid files", () => {
    expect(checkUpload("a.mp3", 1000, max).ok).toBe(true);
  });

  it("rejects bad types, empty files and oversized files", () => {
    expect(checkUpload("a.txt", 1000, max).ok).toBe(false);
    expect(checkUpload("a.mp3", 0, max).ok).toBe(false);
    expect(checkUpload("a.mp3", Number.NaN, max).ok).toBe(false);
    const big = checkUpload("a.mp3", max + 1, max);
    expect(big.ok).toBe(false);
    expect(big.error).toContain("50 MB");
  });
});

describe("originalPath", () => {
  it("uses the user and song ids", () => {
    expect(originalPath("u1", "s1", "mp3")).toBe("u1/s1/original.mp3");
  });
});

describe("withRetry", () => {
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);

  it("succeeds first time and reports completion", async () => {
    const progress: number[] = [];
    await withRetry(async (report) => report(0.5), (value) => progress.push(value), { sleep });
    expect(progress).toEqual([0, 0.5, 1]);
  });

  it("retries failures with growing delays", async () => {
    sleep.mockClear();
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("network");
      },
      () => undefined,
      { sleep, baseDelayMs: 100 },
    );
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it("gives up after the last attempt and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error(`fail ${calls}`);
        },
        () => undefined,
        { sleep, attempts: 3 },
      ),
    ).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });

  it("does not retry an aborted upload", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new UploadAborted();
        },
        () => undefined,
        { sleep },
      ),
    ).rejects.toBeInstanceOf(UploadAborted);
    expect(calls).toBe(1);
  });
});
