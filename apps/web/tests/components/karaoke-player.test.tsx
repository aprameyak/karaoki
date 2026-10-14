import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KaraokePlayer } from "@/components/player/karaoke-player";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const urls = { instrumental: "https://files.test/i.mp3", vocals: "https://files.test/v.mp3", original: "https://files.test/o.mp3" };
const peaks = Array.from({ length: 50 }, (_, i) => (i % 10) / 10);

function setup(overrides: Partial<Parameters<typeof KaraokePlayer>[0]> = {}) {
  return render(
    <KaraokePlayer
      songId="s1"
      userId="u1"
      lyrics={null}
      duration={120}
      peaks={peaks}
      urls={urls}
      downloads={{ instrumental: "https://files.test/di.mp3", vocals: null }}
      {...overrides}
    />,
  );
}

function audioFor(src: string): HTMLAudioElement {
  return document.querySelector(`audio[src="${src}"]`) as HTMLAudioElement;
}

function press(key: string) {
  fireEvent.keyDown(window, { key });
}

const playButton = () => screen.getByRole("button", { name: /^(Play|Pause)$/ });

describe("KaraokePlayer", () => {
  it("plays and pauses with the space bar", async () => {
    setup();
    expect(playButton().getAttribute("aria-label")).toBe("Play");
    await act(async () => press(" "));
    expect(playButton().getAttribute("aria-label")).toBe("Pause");
    expect(audioFor(urls.instrumental).paused).toBe(false);
    await act(async () => press(" "));
    expect(playButton().getAttribute("aria-label")).toBe("Play");
  });

  it("switches stem without losing the position or stopping playback", async () => {
    setup();
    await act(async () => press("k"));
    const instrumental = audioFor(urls.instrumental);
    instrumental.currentTime = 42;
    await act(async () => press("2"));
    expect(audioFor(urls.vocals).currentTime).toBe(42);
    expect(audioFor(urls.vocals).paused).toBe(false);
    expect(instrumental.paused).toBe(true);
    expect(playButton().getAttribute("aria-label")).toBe("Pause");
    expect(screen.getByRole("button", { name: "Vocals" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Instrumental" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("does not stay paused-looking after switching stems while playing", async () => {
    setup();
    await act(async () => press(" "));
    await act(async () => press("3"));
    await act(async () => press("1"));
    expect(playButton().getAttribute("aria-label")).toBe("Pause");
  });

  it("follows the audio element when media keys pause it", async () => {
    setup();
    await act(async () => press(" "));
    await act(async () => {
      audioFor(urls.instrumental).pause();
    });
    expect(playButton().getAttribute("aria-label")).toBe("Play");
  });

  it("changes speed, volume and mute from the keyboard", async () => {
    setup();
    await act(async () => press("]"));
    expect((screen.getByLabelText("Playback speed") as HTMLSelectElement).value).toBe("1.1");
    await act(async () => press("ArrowDown"));
    expect(Number((screen.getByLabelText("Volume") as HTMLInputElement).value)).toBeCloseTo(0.75, 2);
    await act(async () => press("m"));
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
    expect(audioFor(urls.instrumental).volume).toBe(0);
  });

  it("seeks with the arrow keys and stays inside the song", async () => {
    setup();
    const audio = audioFor(urls.instrumental);
    audio.currentTime = 3;
    await act(async () => press("ArrowLeft"));
    expect(audio.currentTime).toBe(0);
    await act(async () => press("ArrowRight"));
    await act(async () => press("l"));
    expect(audio.currentTime).toBe(15);
  });

  it("ignores the shortcuts when they are turned off", async () => {
    setup();
    fireEvent.click(screen.getByLabelText("Turn keyboard shortcuts on"));
    await act(async () => press(" "));
    expect(playButton().getAttribute("aria-label")).toBe("Play");
    fireEvent.click(screen.getByLabelText("Turn keyboard shortcuts on"));
    await act(async () => press(" "));
    expect(playButton().getAttribute("aria-label")).toBe("Pause");
  });

  it("does not hijack the space bar on a focused button or a text field", async () => {
    setup();
    const button = screen.getByRole("button", { name: "Vocals" });
    await act(async () => {
      fireEvent.keyDown(button, { key: " " });
    });
    expect(playButton().getAttribute("aria-label")).toBe("Play");
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    const field = screen.getByLabelText("Lyrics text");
    await act(async () => {
      fireEvent.keyDown(field, { key: " " });
    });
    expect(playButton().getAttribute("aria-label")).toBe("Play");
  });

  it("only offers stems that exist and links the downloads that exist", () => {
    setup({ urls: { ...urls, vocals: null } });
    expect((screen.getByRole("button", { name: "Vocals" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Download instrumental")).toBeTruthy();
    expect(screen.queryByText("Download vocals")).toBeNull();
  });

  it("refreshes expired links and puts playback back where it was", async () => {
    const fresh = { original: urls.original, instrumental: "https://files.test/i2.mp3", vocals: urls.vocals, downloads: { instrumental: null, vocals: null } };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(fresh), { status: 200 }));
    setup();
    await act(async () => press(" "));
    audioFor(urls.instrumental).currentTime = 30;
    await act(async () => {
      fireEvent.error(audioFor(urls.instrumental));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/songs/s1/media", { cache: "no-store" });
    const renewed = audioFor("https://files.test/i2.mp3");
    expect(renewed).toBeTruthy();
    await act(async () => {
      fireEvent.loadedMetadata(renewed);
    });
    expect(renewed.currentTime).toBe(30);
  });

  it("says so when the links cannot be renewed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    setup();
    await act(async () => {
      fireEvent.error(audioFor(urls.instrumental));
    });
    expect(screen.getByText(/could not be refreshed/)).toBeTruthy();
  });

  it("shows a message when nothing can be played", () => {
    setup({ urls: { instrumental: null, vocals: null, original: null } });
    expect(screen.getByText("No audio is available for this song yet.")).toBeTruthy();
  });
});
