"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Gauge, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Waveform } from "@/components/player/waveform";
import {
  SPEEDS,
  STEM_LABELS,
  actionForKey,
  availableStems,
  isTypingTarget,
  ratioToTime,
  seekTarget,
  stemForShortcut,
  stepSpeed,
  timeToRatio,
  type Stem,
} from "@/lib/player";
import { cn, clamp, formatDuration } from "@/lib/utils";

interface Downloads {
  instrumental: string | null;
  vocals: string | null;
}

interface Props {
  songId: string;
  duration: number;
  peaks: number[];
  urls: Record<Stem, string | null>;
  downloads: Downloads;
  initialVolume?: number;
}

const STEMS: Stem[] = ["instrumental", "vocals", "original"];

export function KaraokePlayer({ songId, duration, peaks, urls: initialUrls, downloads: initialDownloads, initialVolume = 0.8 }: Props) {
  const els = useRef<Record<Stem, HTMLAudioElement | null>>({
    instrumental: null,
    vocals: null,
    original: null,
  });
  const refreshing = useRef(false);
  const resume = useRef<{ time: number; play: boolean } | null>(null);

  const [urls, setUrls] = useState(initialUrls);
  const [downloads, setDownloads] = useState(initialDownloads);
  const [stem, setStem] = useState<Stem>(() => availableStems(initialUrls)[0] ?? "instrumental");
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(clamp(initialVolume, 0, 1));
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const active = useCallback(() => els.current[stem], [stem]);

  useEffect(() => {
    for (const key of STEMS) {
      const element = els.current[key];
      if (!element) continue;
      element.volume = muted ? 0 : volume;
      element.playbackRate = rate;
      element.preservesPitch = true;
    }
  }, [volume, muted, rate, urls]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const element = active();
      if (element) setCurrent(element.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active]);

  const [metaDuration, setMetaDuration] = useState(0);
  const total = duration > 0 ? duration : metaDuration;

  const play = useCallback(async () => {
    const element = active();
    if (!element) return;
    try {
      await element.play();
      setPlaying(true);
    } catch {
      setError("Your browser blocked playback. Press play again.");
    }
  }, [active]);

  const pause = useCallback(() => {
    active()?.pause();
    setPlaying(false);
  }, [active]);

  const toggle = useCallback(() => {
    const element = active();
    if (!element) return;
    if (element.paused) void play();
    else pause();
  }, [active, play, pause]);

  const seekTo = useCallback(
    (time: number) => {
      const element = active();
      if (!element) return;
      element.currentTime = clamp(time, 0, Math.max(total, 0));
      setCurrent(element.currentTime);
    },
    [active, total],
  );

  const switchStem = useCallback(
    async (next: Stem) => {
      if (next === stem || !urls[next]) return;
      const from = els.current[stem];
      const to = els.current[next];
      const time = from?.currentTime ?? 0;
      const wasPlaying = Boolean(from && !from.paused);
      from?.pause();
      setStem(next);
      if (to) {
        to.currentTime = time;
        if (wasPlaying) {
          try {
            await to.play();
          } catch {
            setPlaying(false);
          }
        }
      }
    },
    [stem, urls],
  );

  const refreshLinks = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const element = active();
    resume.current = { time: element?.currentTime ?? 0, play: Boolean(element && !element.paused) };
    try {
      const res = await fetch(`/api/songs/${songId}/media`, { cache: "no-store" });
      if (!res.ok) throw new Error("refresh failed");
      const media = (await res.json()) as {
        original: string | null;
        instrumental: string | null;
        vocals: string | null;
        downloads: Downloads;
      };
      setUrls({ original: media.original, instrumental: media.instrumental, vocals: media.vocals });
      setDownloads(media.downloads);
      setError(null);
    } catch {
      resume.current = null;
      setPlaying(false);
      setError("The audio link expired and could not be refreshed. Reload the page.");
    } finally {
      setTimeout(() => {
        refreshing.current = false;
      }, 5000);
    }
  }, [active, songId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const action = actionForKey(event.key);
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case "toggle":
          toggle();
          break;
        case "seek":
          seekTo(seekTarget(active()?.currentTime ?? 0, action.delta, total));
          break;
        case "volume":
          setVolume((value) => clamp(Math.round((value + action.delta) * 100) / 100, 0, 1));
          setMuted(false);
          break;
        case "mute":
          setMuted((value) => !value);
          break;
        case "stem": {
          const next = stemForShortcut(action.stem, urls);
          if (next) void switchStem(next);
          break;
        }
        case "speed":
          setRate((value) => stepSpeed(value, action.direction));
          break;
        case "restart":
          seekTo(0);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seekTo, switchStem, urls, total, active]);

  const stems = availableStems(urls);
  if (stems.length === 0) {
    return <Alert>No audio is available for this song yet.</Alert>;
  }

  return (
    <div className="space-y-5">
      {STEMS.map((key) => (
        <audio
          key={key}
          ref={(node) => {
            els.current[key] = node;
          }}
          src={urls[key] ?? undefined}
          preload="auto"
          onEnded={() => {
            if (key === stem) setPlaying(false);
          }}
          onError={() => {
            if (key === stem && urls[key]) void refreshLinks();
          }}
          onLoadedMetadata={() => {
            const element = els.current[key];
            if (key === stem && element && element.duration > 0) setMetaDuration(element.duration);
            if (key === stem && element && resume.current) {
              const pending = resume.current;
              resume.current = null;
              element.currentTime = pending.time;
              if (pending.play) void element.play().catch(() => setPlaying(false));
            }
          }}
        />
      ))}

      <Waveform peaks={peaks} progress={timeToRatio(current, total)} duration={total} onSeek={(ratio) => seekTo(ratioToTime(ratio, total))} />

      <div className="flex justify-between text-sm tabular-nums text-muted">
        <span>{formatDuration(current)}</span>
        <span>{formatDuration(total)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Back to start" onClick={() => seekTo(0)}>
          <RotateCcw className="h-5 w-5" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Back 10 seconds" onClick={() => seekTo(seekTarget(current, -10, total))}>
          <span className="text-xs font-semibold">-10</span>
        </Button>
        <Button size="icon" className="h-16 w-16" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
        </Button>
        <Button variant="secondary" size="icon" aria-label="Forward 10 seconds" onClick={() => seekTo(seekTarget(current, 10, total))}>
          <span className="text-xs font-semibold">+10</span>
        </Button>
      </div>

      <div role="radiogroup" aria-label="Audio track" className="flex flex-wrap justify-center gap-2">
        {STEMS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={stem === key}
            disabled={!urls[key]}
            onClick={() => void switchStem(key)}
            className={cn(
              "h-11 rounded-full px-5 text-sm transition disabled:opacity-40",
              stem === key ? "bg-gradient-to-r from-primary to-accent text-white" : "bg-surface-2 text-muted hover:text-ink",
            )}
          >
            {STEM_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(event) => {
              setVolume(Number(event.target.value));
              setMuted(false);
            }}
            className="h-2 w-full accent-primary"
          />
        </div>
        <div className="flex items-center gap-3">
          <Gauge className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="speed" className="sr-only">
            Playback speed
          </label>
          <select
            id="speed"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={speed}>
                {speed === 1 ? "Normal speed" : `${speed}x speed`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {downloads.instrumental ? (
          <a href={downloads.instrumental} download className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm hover:bg-surface-2">
            <Download className="h-4 w-4" /> Download instrumental
          </a>
        ) : null}
        {downloads.vocals ? (
          <a href={downloads.vocals} download className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm hover:bg-surface-2">
            <Download className="h-4 w-4" /> Download vocals
          </a>
        ) : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <details className="rounded-2xl border border-line p-4 text-sm text-muted">
        <summary className="cursor-pointer text-ink">Keyboard shortcuts</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
          <dt>Space or K</dt><dd>Play or pause</dd>
          <dt>Left and right</dt><dd>Back or forward 5 seconds</dd>
          <dt>J and L</dt><dd>Back or forward 10 seconds</dd>
          <dt>Up and down</dt><dd>Volume</dd>
          <dt>M</dt><dd>Mute</dd>
          <dt>1, 2, 3</dt><dd>Instrumental, vocals, original</dd>
          <dt>[ and ]</dt><dd>Slower or faster</dd>
          <dt>0 or Home</dt><dd>Back to start</dd>
        </dl>
      </details>
    </div>
  );
}
