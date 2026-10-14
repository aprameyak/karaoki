import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LyricsPanel } from "@/components/player/lyrics-panel";

const upsert = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      upsert,
      delete: () => ({ eq: remove }),
    }),
  }),
}));

const synced = { content: "[00:01.00]Hello there\n[00:05.00]General words\n[00:09.00]Last line", offset_ms: 0 };

function setup(props: Partial<Parameters<typeof LyricsPanel>[0]> = {}) {
  const onSeek = vi.fn();
  const view = render(<LyricsPanel songId="s1" userId="u1" initial={synced} current={0} onSeek={onSeek} {...props} />);
  return { onSeek, ...view };
}

describe("LyricsPanel", () => {
  it("highlights the line that matches the playback time", () => {
    const { rerender, onSeek } = setup({ current: 2 });
    const active = () => document.querySelector('[aria-current="true"]')?.textContent;
    expect(active()).toBe("Hello there");
    rerender(<LyricsPanel songId="s1" userId="u1" initial={synced} current={6} onSeek={onSeek} />);
    expect(active()).toBe("General words");
  });

  it("seeks when a synced line is clicked, allowing for the offset", () => {
    const { onSeek } = setup({ initial: { ...synced, offset_ms: 500 } });
    fireEvent.click(screen.getByText("General words"));
    expect(onSeek).toHaveBeenCalledWith(4.5);
  });

  it("explains that plain lyrics do not follow the song", () => {
    setup({ initial: { content: "Just words\nMore words", offset_ms: 0 } });
    expect(screen.getByText(/have no timestamps/)).toBeTruthy();
    const { onSeek } = setup({ initial: { content: "Just words", offset_ms: 0 } });
    fireEvent.click(screen.getAllByText("Just words")[0]!);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("invites you to add lyrics when there are none", () => {
    setup({ initial: null });
    expect(screen.getByRole("button", { name: "Add lyrics" })).toBeTruthy();
  });

  it("forgets unsaved edits and the unsaved offset when you cancel", () => {
    setup({ initial: { ...synced, offset_ms: 1000 } });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Lyrics text"), { target: { value: "changed" } });
    fireEvent.change(screen.getByLabelText(/Timing offset/), { target: { value: "-3000" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText("Lyrics text") as HTMLTextAreaElement).value).toBe(synced.content);
    expect((screen.getByLabelText(/Timing offset/) as HTMLInputElement).value).toBe("1000");
  });

  it("saves lyrics and confirms it where the user can see it", async () => {
    upsert.mockResolvedValue({ error: null });
    setup({ initial: null });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    fireEvent.change(screen.getByLabelText("Lyrics text"), { target: { value: "[00:02.00]New line" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save lyrics" }));
    });
    expect(upsert).toHaveBeenCalledWith(
      { song_id: "s1", user_id: "u1", content: "[00:02.00]New line", synced: true, offset_ms: 0 },
      { onConflict: "song_id" },
    );
    expect(screen.getByText("Lyrics saved.")).toBeTruthy();
    expect(screen.getByText("New line")).toBeTruthy();
  });

  it("reports a failed save and keeps the editor open", async () => {
    upsert.mockResolvedValue({ error: { message: "nope" } });
    setup({ initial: null });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    fireEvent.change(screen.getByLabelText("Lyrics text"), { target: { value: "words" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save lyrics" }));
    });
    expect(screen.getByText("Could not save the lyrics.")).toBeTruthy();
    expect(screen.getByLabelText("Lyrics text")).toBeTruthy();
  });

  it("refuses empty lyrics", async () => {
    setup({ initial: null });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save lyrics" }));
    });
    expect(screen.getByText("Add some lyrics first.")).toBeTruthy();
  });

  it("imports a file, reads its offset, and can import the same file twice", async () => {
    setup({ initial: null });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    const input = screen.getByLabelText("Import a lyrics file") as HTMLInputElement;
    const file = new File(["[offset:+500]\n[00:01.00]Imported"], "song.lrc", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect((screen.getByLabelText("Lyrics text") as HTMLTextAreaElement).value).toContain("Imported");
    expect((screen.getByLabelText(/Timing offset/) as HTMLInputElement).value).toBe("500");
    expect(input.value).toBe("");
  });

  it("rejects an oversized lyrics file", async () => {
    setup({ initial: null });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    const big = new File(["x".repeat(300_000)], "big.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Import a lyrics file"), { target: { files: [big] } });
    });
    expect(screen.getByText("That file is too large for lyrics.")).toBeTruthy();
  });

  it("stamps the current line with the playback time", () => {
    setup({ initial: null, current: 12.5 });
    fireEvent.click(screen.getByRole("button", { name: "Add lyrics" }));
    const area = screen.getByLabelText("Lyrics text") as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "first\nsecond" } });
    area.setSelectionRange(8, 8);
    fireEvent.select(area);
    fireEvent.click(screen.getByRole("button", { name: /Stamp this line/ }));
    expect(area.value).toBe("first\n[00:12.50]second");
  });
});
