import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyTempoPanel } from "@/components/player/key-tempo-panel";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const created = {
  id: "e1",
  source: "instrumental",
  semitones: 0,
  tempo: 1,
  preview: true,
  status: "queued",
  error: null,
  download_url: null,
};

async function tick(ms = 1500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("KeyTempoPanel", () => {
  it("previews a change and shows the rendered audio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "POST") return reply({ export: created }, 202);
      return reply({ export: { ...created, status: "completed", download_url: "https://files.test/e1.mp3" } });
    });
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    await click("Raise the key");
    await click("Preview 30 seconds");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/songs/s1/exports");
    expect(JSON.parse(init.body as string)).toEqual({ source: "instrumental", semitones: 1, tempo: 1, preview: true });
    await tick();
    const audio = screen.getByLabelText("Rendered audio") as HTMLAudioElement;
    expect(audio.getAttribute("src")).toBe("https://files.test/e1.mp3");
    expect(screen.getByText(/Preview ready/)).toBeTruthy();
  });

  it("adds finished exports to the list only once", async () => {
    const done = { ...created, preview: false, status: "completed", semitones: 2, download_url: "https://files.test/e1.mp3" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      init?.method === "POST" ? reply({ export: { ...created, preview: false, semitones: 2 } }, 202) : reply({ export: done }),
    );
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    await click("Raise the key");
    await click("Raise the key");
    await click("Export full track");
    await tick(1500 * 4);
    expect(screen.getAllByLabelText(/^Download instrumental/)).toHaveLength(1);
  });

  it("stops polling and frees the controls when the export disappears", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      init?.method === "POST"
        ? reply({ export: created }, 202)
        : reply({ error: { code: "not_found", message: "Export not found" } }, 404),
    );
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    await click("Preview 30 seconds");
    await tick();
    expect(screen.getByText("Export not found")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Preview 30 seconds" }) as HTMLButtonElement).disabled).toBe(false);
    const calls = fetchMock.mock.calls.length;
    await tick(30_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("gives up after repeated network errors", async () => {
    let first = true;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (first) {
        first = false;
        return reply({ export: created }, 202);
      }
      throw new TypeError("offline");
    });
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    await click("Preview 30 seconds");
    await tick(1500 * 6);
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Preview 30 seconds" }) as HTMLButtonElement).disabled).toBe(false);
    const calls = fetchMock.mock.calls.length;
    await tick(30_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("recovers when the request itself cannot be sent", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    await click("Preview 30 seconds");
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Preview 30 seconds" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("only offers a full export when something changed", async () => {
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    expect((screen.getByRole("button", { name: "Export full track" }) as HTMLButtonElement).disabled).toBe(true);
    await click("Lower the key");
    expect((screen.getByRole("button", { name: "Export full track" }) as HTMLButtonElement).disabled).toBe(false);
    await click("Reset");
    expect((screen.getByRole("button", { name: "Export full track" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the key between 12 semitones down and up", async () => {
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[]} />);
    for (let i = 0; i < 15; i++) await click("Raise the key");
    expect(screen.getByText("+12 semitones")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Raise the key" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks before deleting an export", async () => {
    const existing = { ...created, id: "old", preview: false, semitones: 3, status: "completed", download_url: "https://files.test/o.mp3" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ deleted: true }));
    const confirm = vi.spyOn(window, "confirm");
    render(<KeyTempoPanel songId="s1" hasVocals initialExports={[existing as never]} />);
    confirm.mockReturnValueOnce(false);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Delete instrumental/));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Delete instrumental/));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/^Delete instrumental/)).toBeNull();
  });
});
