"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "before" | "after";

const SOURCES: Record<Mode, { src: string; label: string }> = {
  before: { src: "/demo/before-full-mix.mp3", label: "Before: full mix" },
  after: { src: "/demo/after-instrumental.mp3", label: "After: instrumental" },
};

export function BeforeAfter() {
  const refs = { before: useRef<HTMLAudioElement>(null), after: useRef<HTMLAudioElement>(null) };
  const [mode, setMode] = useState<Mode>("before");
  const [playing, setPlaying] = useState(false);

  function current() {
    return refs[mode].current;
  }

  async function toggle() {
    const audio = current();
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  async function switchTo(next: Mode) {
    if (next === mode) return;
    const from = current();
    const to = refs[next].current;
    const time = from?.currentTime ?? 0;
    const wasPlaying = Boolean(from && !from.paused);
    from?.pause();
    setMode(next);
    if (to) {
      to.currentTime = time;
      if (wasPlaying) await to.play();
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-surface/70 p-6">
      <div role="tablist" aria-label="Demo track version" className="mb-5 inline-flex rounded-full bg-surface-2 p-1">
        {(Object.keys(SOURCES) as Mode[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={mode === key}
            onClick={() => void switchTo(key)}
            className={cn(
              "rounded-full px-5 py-2 text-sm transition",
              mode === key ? "bg-gradient-to-r from-primary to-accent text-white" : "text-muted hover:text-ink",
            )}
          >
            {SOURCES[key].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <Button type="button" size="icon" onClick={() => void toggle()} aria-label={playing ? "Pause demo" : "Play demo"}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <p className="text-sm text-muted">
          Play the track, then switch versions. The position carries over so you can hear exactly what changes.
        </p>
      </div>
      {(Object.keys(SOURCES) as Mode[]).map((key) => (
        <audio
          key={key}
          ref={refs[key]}
          src={SOURCES[key].src}
          preload="metadata"
          onEnded={() => setPlaying(false)}
        />
      ))}
      <p className="mt-4 text-xs text-muted">
        This demo was synthesized for Karaoki, so there are no rights to worry about. The lead melody stands in for a
        vocal; real songs are separated by the AI model after you upload them.
      </p>
    </div>
  );
}
