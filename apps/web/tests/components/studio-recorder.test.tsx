import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRecorder } from "@/components/player/studio-recorder";

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"]) });
    this.onstop?.();
  }
}

class FakeAudioContext {
  baseLatency = 0.02;
  outputLatency = 0.03;
  createMediaStreamSource() {
    return { connect: () => undefined };
  }
  createAnalyser() {
    return { fftSize: 0, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) };
  }
  close() {
    return Promise.resolve();
  }
}

function microphone() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } };
}

function setupBrowser(getUserMedia: () => Promise<unknown>) {
  FakeRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = vi.fn(() => "blob:take");
  URL.revokeObjectURL = vi.fn();
}

const props = { songId: "s1", title: "My Song", instrumentalUrl: "https://files.test/i.mp3", initialRecordings: [] };

async function start() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudioRecorder", () => {
  it("explains a blocked microphone and stays ready to try again", async () => {
    setupBrowser(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    render(<StudioRecorder {...props} />);
    await start();
    expect(screen.getByText(/Microphone access was blocked/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Start recording/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Your take/)).toBeNull();
  });

  it("explains a missing microphone differently", async () => {
    setupBrowser(() => Promise.reject(new DOMException("none", "NotFoundError")));
    render(<StudioRecorder {...props} />);
    await start();
    expect(screen.getByText(/Check that a microphone is connected/)).toBeTruthy();
  });

  it("shows a clear indicator while the microphone is on, then keeps the take after stopping", async () => {
    const { track, stream } = microphone();
    setupBrowser(() => Promise.resolve(stream));
    render(<StudioRecorder {...props} />);
    await start();
    expect(screen.getByText("Recording. Your microphone is on.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    });
    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByText("Recording. Your microphone is on.")).toBeNull();
    expect(screen.getByLabelText("Your take, without the backing track")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save and mix" })).toBeTruthy();
  });

  it("lets you discard a take and record again", async () => {
    const { stream } = microphone();
    setupBrowser(() => Promise.resolve(stream));
    render(<StudioRecorder {...props} />);
    await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    });
    expect(screen.queryByLabelText("Your take, without the backing track")).toBeNull();
    expect((screen.getByRole("button", { name: /Start recording/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("releases the microphone if the page is closed while the permission prompt is open", async () => {
    const { track, stream } = microphone();
    let allow: (value: unknown) => void = () => undefined;
    setupBrowser(() => new Promise((resolve) => (allow = resolve)));
    const { unmount } = render(<StudioRecorder {...props} />);
    await start();
    unmount();
    await act(async () => {
      allow(stream);
    });
    expect(track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it("releases the microphone and does not keep a take when recording is interrupted by leaving the page", async () => {
    const { track, stream } = microphone();
    setupBrowser(() => Promise.resolve(stream));
    const { unmount } = render(<StudioRecorder {...props} />);
    await start();
    unmount();
    expect(track.stop).toHaveBeenCalled();
    expect(FakeRecorder.instances[0]?.state).toBe("inactive");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("blames the backing track, not the microphone, when it cannot play, and keeps no phantom take", async () => {
    const { track, stream } = microphone();
    setupBrowser(() => Promise.resolve(stream));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("expired", "NotSupportedError"));
    render(<StudioRecorder {...props} />);
    await start();
    expect(screen.getByText(/backing track could not be played/)).toBeTruthy();
    expect(track.stop).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByLabelText("Your take, without the backing track")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("uses the browser's latency to suggest a sync offset", async () => {
    const { stream } = microphone();
    setupBrowser(() => Promise.resolve(stream));
    render(<StudioRecorder {...props} />);
    await start();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    });
    expect(screen.getByText("Sync: -50 ms")).toBeTruthy();
  });

  it("tells browsers that cannot record what to do", () => {
    setupBrowser(() => Promise.resolve(null));
    vi.stubGlobal("MediaRecorder", undefined);
    render(<StudioRecorder {...props} />);
    expect(screen.getByText(/browser cannot record audio/)).toBeTruthy();
  });

  it("asks before deleting a saved take and stops polling a finished one", async () => {
    setupBrowser(() => Promise.resolve(null));
    const recording = { id: "r1", title: "Take one", status: "ready", error: null, offset_ms: 0, vocal_gain: 1, backing_gain: 0.8, mix_url: "https://files.test/m.mp3" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<StudioRecorder {...props} initialRecordings={[recording as never]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Delete Take one"));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Delete Take one"));
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Take one")).toBeNull();
  });

  it("polls a take that is still mixing and stops when it finishes", async () => {
    setupBrowser(() => Promise.resolve(null));
    const mixing = { id: "r1", title: "Take one", status: "mixing", error: null, offset_ms: 0, vocal_gain: 1, backing_gain: 0.8, mix_url: null };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ recording: { ...mixing, status: "ready", mix_url: "https://files.test/m.mp3" } }), { status: 200 }),
    );
    render(<StudioRecorder {...props} initialRecordings={[mixing as never]} />);
    expect(screen.getByText(/Mixing your take/)).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByLabelText("Mix of Take one")).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("stops polling and says so when the status cannot be fetched", async () => {
    setupBrowser(() => Promise.resolve(null));
    const mixing = { id: "r1", title: "Take one", status: "mixing", error: null, offset_ms: 0, vocal_gain: 1, backing_gain: 0.8, mix_url: null };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<StudioRecorder {...props} initialRecordings={[mixing as never]} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000 * 6);
    });
    expect(screen.getByText(/Could not check on your mix/)).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
