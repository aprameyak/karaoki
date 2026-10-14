import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadFlow } from "@/components/dashboard/upload-flow";

const putCalls = vi.hoisted(() => ({ count: 0, fail: false }));

vi.mock("@/lib/upload", async (original) => ({
  ...(await original<typeof import("@/lib/upload")>()),
  putFile: () => async (onProgress: (fraction: number) => void) => {
    putCalls.count += 1;
    if (putCalls.fail) throw new Error("network");
    onProgress(1);
  },
}));

const limits = { maxFileBytes: 50 * 1024 * 1024, maxMinutes: 10, jobsLeft: 3 };

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function choose(name = "My Song.mp3", size = 2048) {
  const file = new File([new Uint8Array(size)], name, { type: "audio/mpeg" });
  fireEvent.change(screen.getByLabelText("Choose an audio file"), { target: { files: [file] } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Upload and process|Try again|Working/ }));
  });
}

function ready() {
  choose();
  fireEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  putCalls.count = 0;
  putCalls.fail = false;
});

describe("UploadFlow", () => {
  it("does nothing until a song is chosen and the rights are confirmed", () => {
    render(<UploadFlow limits={limits} />);
    expect(screen.queryByRole("button", { name: "Upload and process" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Upload and process" }) as HTMLButtonElement).disabled).toBe(true);
    choose();
    expect((screen.getByRole("button", { name: "Upload and process" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button", { name: "Upload and process" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("My Song");
  });

  it("rejects the wrong kind of file and files over the limit", () => {
    render(<UploadFlow limits={limits} />);
    choose("notes.txt");
    expect(screen.getByText("Choose an MP3, WAV, M4A or FLAC file.")).toBeTruthy();
    choose("big.mp3", 2);
    const big = new File([new Uint8Array(1)], "a.mp3");
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Choose an audio file"), { target: { files: [big] } });
    expect(screen.getByText(/larger than the limit/)).toBeTruthy();
  });

  it("uploads, starts processing and shows the job", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input) === "/api/uploads"
        ? reply({ songId: "s1", uploadUrl: "https://files.test/up" })
        : reply({ job: { id: "j1", status: "queued", stage: null, progress: null, error: null } }),
    );
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    expect(putCalls.count).toBe(1);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/uploads", "/api/songs/s1/process"]);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      filename: "My Song.mp3",
      rightsConfirmed: true,
      title: "My Song",
    });
    expect(screen.getByRole("link", { name: "Open song" }).getAttribute("href")).toBe("/dashboard/songs/s1");
  });

  it("recovers from a network failure when creating the upload", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Upload and process" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the server's message when the upload is refused", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ error: { code: "too_many_uploads", message: "You have several uploads waiting." } }, 429),
    );
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    expect(screen.getByText("You have several uploads waiting.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Upload and process" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("lets you retry a failed upload without creating a second song", async () => {
    vi.useFakeTimers();
    putCalls.fail = true;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input) === "/api/uploads"
        ? reply({ songId: "s1", uploadUrl: "https://files.test/up" })
        : reply({ job: { id: "j1", status: "queued", stage: null, progress: null, error: null } }),
    );
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(putCalls.count).toBe(3);
    expect(screen.getByText(/The upload failed/)).toBeTruthy();
    putCalls.fail = false;
    await submit();
    expect(fetchMock.mock.calls.filter((call) => call[0] === "/api/uploads")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open song" })).toBeTruthy();
  });

  it("does not upload the file again when only starting the job failed", async () => {
    let processCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/uploads") return reply({ songId: "s1", uploadUrl: "https://files.test/up" });
      processCalls += 1;
      return processCalls === 1
        ? reply({ error: { code: "quota_exceeded", message: "used up" } }, 402)
        : reply({ job: { id: "j1", status: "queued", stage: null, progress: null, error: null } });
    });
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    expect(screen.getByText(/used all of your processing jobs/)).toBeTruthy();
    await submit();
    expect(putCalls.count).toBe(1);
    expect(screen.getByRole("link", { name: "Open song" })).toBeTruthy();
  });

  it("recovers when starting the job throws a network error", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls += 1;
      if (String(input) === "/api/uploads") return reply({ songId: "s1", uploadUrl: "https://files.test/up" });
      throw new TypeError("offline");
    });
    render(<UploadFlow limits={limits} />);
    ready();
    await submit();
    expect(calls).toBe(2);
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is honest when there are no songs left this month", () => {
    render(<UploadFlow limits={{ ...limits, jobsLeft: 0 }} />);
    expect(screen.getByText(/used all of this month's songs/)).toBeTruthy();
    expect(screen.queryByText(/start next month/)).toBeNull();
  });

  it("ignores a second click while the first is still working", async () => {
    let release: () => void = () => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(reply({ error: { code: "x", message: "stop" } }, 400)))),
    );
    render(<UploadFlow limits={limits} />);
    ready();
    const button = screen.getByRole("button", { name: "Upload and process" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });
});
