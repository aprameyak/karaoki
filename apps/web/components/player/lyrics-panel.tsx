"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Stamp, Upload } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { activeIndex, parseLrc, stampLine } from "@/lib/lrc";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SavedLyrics {
  content: string;
  offset_ms: number;
}

interface Props {
  songId: string;
  userId: string;
  initial: SavedLyrics | null;
  current: number;
  onSeek: (seconds: number) => void;
}

const MAX_LENGTH = 100_000;
const MAX_FILE_BYTES = 200_000;
const MAX_OFFSET_MS = 10_000;

export function LyricsPanel({ songId, userId, initial, current, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const caret = useRef(0);

  const [saved, setSaved] = useState<SavedLyrics | null>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial?.content ?? "");
  const [offsetMs, setOffsetMs] = useState(initial?.offset_ms ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const parsed = useMemo(() => parseLrc(saved?.content ?? ""), [saved]);
  const index = parsed.synced ? activeIndex(parsed.lines, current, offsetMs) : -1;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const container = list.current;
    if (!container || index < 0) return;
    const line = container.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!line) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [index]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.current?.requestFullscreen();
    } catch {
      setMessage({ tone: "danger", text: "Your browser would not enter full screen." });
    }
  }

  function cancelEditing() {
    setDraft(saved?.content ?? "");
    setOffsetMs(saved?.offset_ms ?? 0);
    setMessage(null);
    setEditing(false);
  }

  async function save() {
    const content = draft.trim();
    if (content.length === 0) {
      setMessage({ tone: "danger", text: "Add some lyrics first." });
      return;
    }
    if (content.length > MAX_LENGTH) {
      setMessage({ tone: "danger", text: "Those lyrics are too long." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.from("lyrics").upsert(
      { song_id: songId, user_id: userId, content, synced: parseLrc(content).synced, offset_ms: offsetMs },
      { onConflict: "song_id" },
    );
    setBusy(false);
    if (error) {
      setMessage({ tone: "danger", text: "Could not save the lyrics." });
      return;
    }
    setSaved({ content, offset_ms: offsetMs });
    setEditing(false);
    setMessage({ tone: "success", text: "Lyrics saved." });
  }

  async function remove() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("lyrics").delete().eq("song_id", songId);
    setBusy(false);
    if (error) {
      setMessage({ tone: "danger", text: "Could not remove the lyrics." });
      return;
    }
    setSaved(null);
    setDraft("");
    setOffsetMs(0);
    setEditing(false);
    setMessage(null);
  }

  async function importFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ tone: "danger", text: "That file is too large for lyrics." });
      return;
    }
    try {
      const text = await file.text();
      const imported = parseLrc(text);
      setDraft(text);
      setOffsetMs(Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, imported.offsetMs)));
      setMessage(null);
    } catch {
      setMessage({ tone: "danger", text: "Could not read that file." });
    }
  }

  function stamp() {
    const result = stampLine(draft, caret.current, current);
    setDraft(result.text);
    caret.current = result.caret;
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(result.caret, result.caret);
    });
  }

  if (editing) {
    return (
      <section aria-label="Edit lyrics" className="space-y-4 rounded-2xl border border-line p-4">
        <p className="text-sm text-muted">
          Only add lyrics you have permission to use. Karaoki does not provide lyrics. Timestamped lines like{" "}
          <code className="rounded bg-surface-2 px-1">[01:23.40]words</code> scroll in sync with the song.
        </p>
        <textarea
          ref={textarea}
          value={draft}
          aria-label="Lyrics text"
          rows={12}
          maxLength={MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onSelect={(event) => {
            caret.current = event.currentTarget.selectionStart;
          }}
          className="w-full rounded-xl border border-line bg-surface p-4 font-mono text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={stamp}>
            <Stamp className="h-4 w-4" /> Stamp this line at the current time
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Import a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".lrc,.txt,text/plain"
            className="sr-only"
            aria-label="Import a lyrics file"
            onChange={(event) => void importFile(event.currentTarget)}
          />
        </div>
        <div>
          <label htmlFor="lyrics-offset" className="mb-2 block text-sm">
            Timing offset: {offsetMs > 0 ? "+" : ""}
            {(offsetMs / 1000).toFixed(2)} s
          </label>
          <input
            id="lyrics-offset"
            type="range"
            min={-MAX_OFFSET_MS}
            max={MAX_OFFSET_MS}
            step={50}
            value={offsetMs}
            onChange={(event) => setOffsetMs(Number(event.target.value))}
            className="h-2 w-full accent-primary"
          />
          <p className="mt-1 text-xs text-muted">Move this if the lyrics show up too early or too late.</p>
        </div>
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Save lyrics
          </Button>
          <Button type="button" variant="ghost" onClick={cancelEditing}>
            Cancel
          </Button>
          {saved ? (
            <Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>
              Remove lyrics
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!saved) {
    return (
      <section aria-label="Lyrics" className="rounded-2xl border border-dashed border-line p-5 text-center">
        <p className="text-sm text-muted">
          Add lyrics you have the right to use, or import a timestamped .lrc file, and follow along line by line.
        </p>
        <Button className="mt-4" variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Add lyrics
        </Button>
        {message ? <Alert className="mt-4" tone={message.tone}>{message.text}</Alert> : null}
      </section>
    );
  }

  return (
    <section
      ref={box}
      aria-label="Lyrics"
      className={cn("rounded-2xl border border-line p-4", fullscreen && "flex h-screen flex-col justify-center bg-bg p-10")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Lyrics</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => void toggleFullscreen()}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>
          {!fullscreen ? (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      <div
        ref={list}
        className={cn("space-y-3 overflow-y-auto text-center", fullscreen ? "max-h-[80vh]" : "max-h-72")}
        aria-live="off"
      >
        {parsed.lines.map((line, i) => {
          const active = i === index;
          const clickable = parsed.synced && line.time !== null;
          return (
            <p
              key={`${i}-${line.time ?? "x"}`}
              data-line={i}
              aria-current={active ? "true" : undefined}
              onClick={clickable ? () => onSeek(Math.max(0, (line.time ?? 0) - offsetMs / 1000)) : undefined}
              className={cn(
                "transition",
                fullscreen ? "text-3xl md:text-5xl" : "text-lg",
                clickable && "cursor-pointer",
                active ? "font-semibold text-ink" : "text-muted",
                line.text === "" && "min-h-6",
              )}
            >
              {line.text === "" ? "♪" : line.text}
            </p>
          );
        })}
      </div>
      {!parsed.synced ? (
        <p className="mt-3 text-center text-xs text-muted">
          These lyrics have no timestamps, so they will not follow the song. Edit them to add timing.
        </p>
      ) : null}
      {fullscreen ? <p className="mt-4 text-center text-sm text-muted">Space plays and pauses. Escape exits.</p> : null}
      {message ? <Alert className="mt-3" tone={message.tone}>{message.text}</Alert> : null}
    </section>
  );
}
