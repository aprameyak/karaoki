"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Mic, Square, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { RecordingItem } from "@/lib/media";
import { readApiError } from "@/lib/messages";
import { defaultOffsetMs, extensionForMime, formatElapsed, pickMimeType, rmsLevel } from "@/lib/recorder";
import { putFile, withRetry } from "@/lib/upload";
import { cn } from "@/lib/utils";

interface Props {
  songId: string;
  title: string;
  instrumentalUrl: string;
  initialRecordings: RecordingItem[];
}

type Phase = "idle" | "preparing" | "recording" | "recorded" | "saving";

interface Take {
  blob: Blob;
  url: string;
  ms: number;
}

const POLL_MS = 2000;

export function StudioRecorder({ songId, title, instrumentalUrl, initialRecordings }: Props) {
  const backing = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const frame = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const touchedOffset = useRef(false);

  const supported = useSyncExternalStore(
    () => () => undefined,
    () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    () => true,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [name, setName] = useState("My take");
  const [offsetMs, setOffsetMs] = useState(0);
  const [vocalGain, setVocalGain] = useState(1);
  const [backingGain, setBackingGain] = useState(0.8);
  const [progress, setProgress] = useState(0);
  const [recordings, setRecordings] = useState<RecordingItem[]>(initialRecordings);

  const releaseMicrophone = useCallback(() => {
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => undefined);
    context.current = null;
    analyser.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    const element = backing.current;
    return () => {
      releaseMicrophone();
      element?.pause();
    };
  }, [releaseMicrophone]);

  useEffect(() => {
    return () => {
      if (take) URL.revokeObjectURL(take.url);
    };
  }, [take]);

  const pending = recordings.filter((item) => item.status === "mixing" || item.status === "uploaded").map((item) => item.id).join(",");

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(async () => {
      for (const id of pending.split(",")) {
        const res = await fetch(`/api/recordings/${id}`, { cache: "no-store" });
        if (!res.ok) continue;
        const { recording } = (await res.json()) as { recording: RecordingItem };
        setRecordings((list) => list.map((item) => (item.id === id ? { ...item, ...recording } : item)));
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending]);

  function meter() {
    const node = analyser.current;
    if (!node) return;
    const samples = new Uint8Array(node.fftSize);
    node.getByteTimeDomainData(samples);
    setLevel(rmsLevel(samples));
    setElapsed(performance.now() - startedAt.current);
    frame.current = requestAnimationFrame(meter);
  }

  async function startRecording() {
    if (phase === "preparing" || phase === "recording") return;
    setError(null);
    setPhase("preparing");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      stream.current = media;
      const mime = pickMimeType((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const instance = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        const type = instance.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        setTake({ blob, url: URL.createObjectURL(blob), ms: performance.now() - startedAt.current });
        setPhase("recorded");
        releaseMicrophone();
      };
      recorder.current = instance;

      const audioContext = new AudioContext();
      context.current = audioContext;
      const source = audioContext.createMediaStreamSource(media);
      const node = audioContext.createAnalyser();
      node.fftSize = 1024;
      source.connect(node);
      analyser.current = node;
      if (!touchedOffset.current) {
        setOffsetMs(defaultOffsetMs(audioContext.baseLatency, (audioContext as AudioContext & { outputLatency?: number }).outputLatency));
      }

      const element = backing.current;
      if (element) element.currentTime = 0;
      startedAt.current = performance.now();
      instance.start(250);
      await element?.play();
      setPhase("recording");
      frame.current = requestAnimationFrame(meter);
    } catch (failure) {
      releaseMicrophone();
      setPhase("idle");
      const denied = failure instanceof DOMException && (failure.name === "NotAllowedError" || failure.name === "SecurityError");
      setError(
        denied
          ? "Microphone access was blocked. Allow it in your browser's site settings, then try again."
          : "Could not start recording. Check that a microphone is connected.",
      );
    }
  }

  function stopRecording() {
    backing.current?.pause();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  function retake() {
    setTake(null);
    setPhase("idle");
    setProgress(0);
    setError(null);
  }

  async function save() {
    if (!take || phase === "saving") return;
    setPhase("saving");
    setError(null);
    setProgress(0);
    try {
      const extension = extensionForMime(take.blob.type);
      const prepared = await fetch(`/api/songs/${songId}/recordings/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension }),
      });
      if (!prepared.ok) throw new Error((await readApiError(prepared)).message);
      const { path, uploadUrl } = (await prepared.json()) as { path: string; uploadUrl: string };

      const file = new File([take.blob], `take.${extension}`, { type: take.blob.type });
      await withRetry(putFile(uploadUrl, file), setProgress);

      const created = await fetch(`/api/songs/${songId}/recordings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, title: name.trim() || "Take", offsetMs, vocalGain, backingGain }),
      });
      if (!created.ok) throw new Error((await readApiError(created)).message);
      const { recording } = (await created.json()) as { recording: RecordingItem };
      setRecordings((list) => [{ ...recording, mix_url: null }, ...list]);
      setTake(null);
      setPhase("idle");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your take.");
      setPhase("recorded");
    }
  }

  async function remix(item: RecordingItem, changes: Partial<Pick<RecordingItem, "offset_ms" | "vocal_gain" | "backing_gain">>) {
    const next = { ...item, ...changes };
    const res = await fetch(`/api/recordings/${item.id}/remix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offsetMs: next.offset_ms, vocalGain: next.vocal_gain, backingGain: next.backing_gain }),
    });
    if (!res.ok) {
      setError((await readApiError(res)).message);
      return;
    }
    setRecordings((list) => list.map((entry) => (entry.id === item.id ? { ...next, status: "mixing", mix_url: null, error: null } : entry)));
  }

  async function remove(id: string) {
    const res = await fetch(`/api/recordings/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await readApiError(res)).message);
      return;
    }
    setRecordings((list) => list.filter((item) => item.id !== id));
  }

  if (!supported) {
    return <Alert>Your browser cannot record audio. Try a recent version of Chrome, Edge, Firefox or Safari.</Alert>;
  }

  const recording = phase === "recording";

  return (
    <div className="space-y-8">
      <audio ref={backing} src={instrumentalUrl} preload="auto" onEnded={stopRecording} />

      <section aria-label="Recorder" className="space-y-5 rounded-2xl border border-line p-5">
        <div className="space-y-2 text-sm text-muted">
          <p>
            <strong className="text-ink">Use headphones</strong> so the backing track is not picked up by your
            microphone. Your microphone is only on while you are recording, and your takes are private to your account.
          </p>
        </div>

        {recording ? (
          <div role="status" className="flex items-center gap-3 rounded-xl bg-danger/15 px-4 py-3 text-danger">
            <span className="h-3 w-3 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            <span className="font-medium">Recording. Your microphone is on.</span>
            <span className="ml-auto tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
        ) : null}

        <div aria-hidden={!recording} className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>

        <div className="flex flex-wrap gap-3">
          {!recording ? (
            <Button size="lg" disabled={phase === "preparing" || phase === "saving" || phase === "recorded"} onClick={() => void startRecording()}>
              <Mic className="h-5 w-5" /> {phase === "preparing" ? "Waiting for your microphone..." : "Start recording"}
            </Button>
          ) : (
            <Button size="lg" variant="danger" onClick={stopRecording}>
              <Square className="h-5 w-5" /> Stop
            </Button>
          )}
        </div>

        {take ? (
          <div className="space-y-5 rounded-xl bg-surface-2 p-4">
            <div>
              <p className="mb-2 text-sm font-medium">Your take ({formatElapsed(take.ms)})</p>
              <audio controls src={take.url} className="w-full" aria-label="Your take, without the backing track" />
              <p className="mt-2 text-xs text-muted">This is your voice on its own. Save it to hear the final mix.</p>
            </div>
            <div>
              <Label htmlFor="take-title">Name</Label>
              <Input id="take-title" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} disabled={phase === "saving"} />
            </div>
            <MixControls
              offsetMs={offsetMs}
              vocalGain={vocalGain}
              backingGain={backingGain}
              disabled={phase === "saving"}
              onOffset={(value) => {
                touchedOffset.current = true;
                setOffsetMs(value);
              }}
              onVocal={setVocalGain}
              onBacking={setBackingGain}
            />
            {phase === "saving" ? <Progress value={progress * 100} label="Upload progress" /> : null}
            <div className="flex flex-wrap gap-3">
              <Button disabled={phase === "saving"} onClick={() => void save()}>
                {phase === "saving" ? "Saving..." : "Save and mix"}
              </Button>
              <Button variant="ghost" disabled={phase === "saving"} onClick={retake}>
                Retake
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}
      </section>

      <section aria-label="Saved takes" className="space-y-4">
        <h2 className="text-xl font-semibold">Saved takes for {title}</h2>
        {recordings.length === 0 ? <p className="text-sm text-muted">Nothing saved yet.</p> : null}
        {recordings.map((item) => (
          <article key={item.id} className="space-y-4 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate font-medium">{item.title}</h3>
              <button type="button" aria-label={`Delete ${item.title}`} disabled={item.status === "mixing"} onClick={() => void remove(item.id)} className="text-muted hover:text-danger disabled:opacity-40">
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            {item.status === "mixing" || item.status === "uploaded" ? <p role="status" className="text-sm text-muted">Mixing your take with the backing track...</p> : null}
            {item.status === "failed" ? <Alert>{item.error ?? "Mixing failed."}</Alert> : null}
            {item.status === "ready" && item.mix_url ? (
              <div className="space-y-2">
                <audio controls src={item.mix_url} className="w-full" aria-label={`Mix of ${item.title}`} />
                <a href={item.mix_url} download className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <Download className="h-4 w-4" /> Download
                </a>
              </div>
            ) : null}
            {item.status === "ready" || item.status === "failed" ? (
              <RemixControls item={item} onRemix={(changes) => void remix(item, changes)} />
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function MixControls({
  offsetMs,
  vocalGain,
  backingGain,
  disabled,
  onOffset,
  onVocal,
  onBacking,
}: {
  offsetMs: number;
  vocalGain: number;
  backingGain: number;
  disabled?: boolean;
  onOffset: (value: number) => void;
  onVocal: (value: number) => void;
  onBacking: (value: number) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Slider id="mix-offset" label={`Sync: ${offsetMs > 0 ? "+" : ""}${offsetMs} ms`} min={-500} max={500} step={10} value={offsetMs} disabled={disabled} onChange={onOffset} hint="Negative moves your voice earlier" />
      <Slider id="mix-vocal" label={`Your voice: ${Math.round(vocalGain * 100)}%`} min={0} max={2} step={0.05} value={vocalGain} disabled={disabled} onChange={onVocal} />
      <Slider id="mix-backing" label={`Backing: ${Math.round(backingGain * 100)}%`} min={0} max={2} step={0.05} value={backingGain} disabled={disabled} onChange={onBacking} />
    </div>
  );
}

function RemixControls({ item, onRemix }: { item: RecordingItem; onRemix: (changes: Partial<Pick<RecordingItem, "offset_ms" | "vocal_gain" | "backing_gain">>) => void }) {
  const [offset, setOffset] = useState(item.offset_ms);
  const [vocal, setVocal] = useState(item.vocal_gain);
  const [backing, setBacking] = useState(item.backing_gain);
  const changed = offset !== item.offset_ms || vocal !== item.vocal_gain || backing !== item.backing_gain;
  return (
    <details className="rounded-xl border border-line p-3 text-sm">
      <summary className="cursor-pointer">Adjust sync and volume</summary>
      <div className="mt-4 space-y-4">
        <MixControls offsetMs={offset} vocalGain={vocal} backingGain={backing} onOffset={setOffset} onVocal={setVocal} onBacking={setBacking} />
        <Button size="sm" disabled={!changed} onClick={() => onRemix({ offset_ms: offset, vocal_gain: vocal, backing_gain: backing })}>
          Mix again
        </Button>
      </div>
    </details>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  disabled,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className={cn(disabled && "opacity-60")}>
      <label htmlFor={id} className="mb-2 block text-sm">
        {label}
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="h-2 w-full accent-primary" />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
