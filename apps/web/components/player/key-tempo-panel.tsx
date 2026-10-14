"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { postJson, send } from "@/lib/http";

export interface ExportView {
  id: string;
  source: "instrumental" | "vocals";
  semitones: number;
  tempo: number | string;
  preview: boolean;
  status: "queued" | "processing" | "completed" | "failed";
  error: string | null;
  download_url: string | null;
}

interface Props {
  songId: string;
  hasVocals: boolean;
  initialExports: ExportView[];
}

const POLL_MS = 1500;
const MAX_POLL_MS = 5 * 60 * 1000;
const GIVE_UP_AFTER = 5;

export function describeExport(item: Pick<ExportView, "source" | "semitones" | "tempo">): string {
  const key = item.semitones === 0 ? "original key" : `key ${item.semitones > 0 ? "+" : ""}${item.semitones}`;
  return `${item.source} · ${key} · ${Number(item.tempo)}x tempo`;
}

export function KeyTempoPanel({ songId, hasVocals, initialExports }: Props) {
  const [source, setSource] = useState<"instrumental" | "vocals">("instrumental");
  const [semitones, setSemitones] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [active, setActive] = useState<ExportView | null>(null);
  const [exports, setExports] = useState<ExportView[]>(initialExports);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const failures = useRef(0);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      failures.current = 0;
      const startedAt = Date.now();
      timer.current = setInterval(async () => {
        if (Date.now() - startedAt > MAX_POLL_MS) {
          stopPolling();
          setBusy(false);
          setError("This is taking longer than expected. Reload the page to check on it.");
          return;
        }
        const out = await send(`/api/exports/${id}`, { cache: "no-store" });
        if (!out.ok || !out.res) {
          failures.current += 1;
          if (out.res?.status === 404 || failures.current >= GIVE_UP_AFTER) {
            stopPolling();
            setBusy(false);
            setError(out.message);
          }
          return;
        }
        failures.current = 0;
        const { export: next } = (await out.res.json()) as { export: ExportView };
        setActive(next);
        if (next.status === "completed" || next.status === "failed") {
          stopPolling();
          setBusy(false);
          if (next.status === "failed") setError(next.error ?? "The export failed.");
          if (next.status === "completed" && !next.preview) {
            setExports((list) => (list.some((item) => item.id === next.id) ? list : [next, ...list]));
          }
        }
      }, POLL_MS);
    },
    [stopPolling],
  );

  async function start(preview: boolean) {
    setBusy(true);
    setError(null);
    setActive(null);
    const out = await postJson(`/api/songs/${songId}/exports`, { source, semitones, tempo, preview });
    if (!out.ok || !out.res) {
      setError(out.message);
      setBusy(false);
      return;
    }
    const { export: created } = (await out.res.json()) as { export: ExportView };
    setActive(created);
    poll(created.id);
  }

  async function remove(item: ExportView) {
    if (!window.confirm(`Delete this export (${describeExport(item)})?`)) return;
    const out = await postJson(`/api/exports/${item.id}`, undefined, "DELETE");
    if (out.ok) setExports((list) => list.filter((entry) => entry.id !== item.id));
    else setError(out.message);
  }

  const unchanged = semitones === 0 && Math.abs(tempo - 1) < 0.005;

  return (
    <section aria-label="Key and tempo" className="space-y-5 rounded-2xl border border-line p-4">
      <div>
        <h2 className="text-lg font-semibold">Key and tempo</h2>
        <p className="mt-1 text-sm text-muted">
          Change the key without changing the speed, or the speed without changing the key. Preview a short clip, then
          export the full track.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Key</p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="icon" aria-label="Lower the key" disabled={semitones <= -12 || busy} onClick={() => setSemitones((v) => v - 1)}>
              <Minus className="h-4 w-4" />
            </Button>
            <output aria-live="polite" className="min-w-24 text-center text-lg tabular-nums">
              {semitones > 0 ? "+" : ""}
              {semitones} semitones
            </output>
            <Button variant="secondary" size="icon" aria-label="Raise the key" disabled={semitones >= 12 || busy} onClick={() => setSemitones((v) => v + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div>
          <label htmlFor="export-tempo" className="mb-2 block text-sm font-medium">
            Tempo: {tempo.toFixed(2)}x
          </label>
          <input
            id="export-tempo"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={tempo}
            disabled={busy}
            onChange={(event) => setTempo(Math.round(Number(event.target.value) * 100) / 100)}
            className="h-2 w-full accent-primary"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="export-source" className="text-sm">
          Track
        </label>
        <select
          id="export-source"
          value={source}
          disabled={busy}
          onChange={(event) => setSource(event.target.value as "instrumental" | "vocals")}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="instrumental">Instrumental</option>
          {hasVocals ? <option value="vocals">Vocals</option> : null}
        </select>
        <Button variant="ghost" size="sm" disabled={busy || unchanged} onClick={() => { setSemitones(0); setTempo(1); }}>
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={() => void start(true)}>
          Preview 30 seconds
        </Button>
        <Button disabled={busy || unchanged} onClick={() => void start(false)}>
          Export full track
        </Button>
      </div>

      {active && (active.status === "queued" || active.status === "processing") ? (
        <p role="status" className="text-sm text-muted">
          {active.preview ? "Rendering your preview..." : "Rendering your export..."}
        </p>
      ) : null}

      {active?.status === "completed" && active.download_url ? (
        <div className="space-y-3 rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-medium">{active.preview ? "Preview ready" : "Export ready"}: {describeExport(active)}</p>
          <audio controls src={active.download_url} className="w-full" aria-label="Rendered audio" />
          {!active.preview ? (
            <a href={active.download_url} download className="inline-flex items-center gap-2 text-sm text-link hover:underline">
              <Download className="h-4 w-4" /> Download
            </a>
          ) : null}
        </div>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {exports.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Your exports</h3>
          <ul className="space-y-2">
            {exports.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="truncate">{describeExport(item)}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {item.download_url ? (
                    <a href={item.download_url} download aria-label={`Download ${describeExport(item)}`} className="text-link hover:underline">
                      <Download className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button type="button" aria-label={`Delete ${describeExport(item)}`} onClick={() => void remove(item)} className="text-muted hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
