"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileAudio, UploadCloud } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { JobProgress, type JobView } from "@/components/dashboard/job-progress";
import { readApiError } from "@/lib/messages";
import { checkUpload, putFile, titleFromFilename, withRetry } from "@/lib/upload";
import { cn, formatBytes } from "@/lib/utils";

type Phase = "idle" | "uploading" | "uploaded" | "processing";

interface Limits {
  maxFileBytes: number;
  maxMinutes: number;
  jobsLeft: number;
}

export function UploadFlow({ limits }: { limits: Limits }) {
  const input = useRef<HTMLInputElement>(null);
  const inflight = useRef(false);
  const uploadDone = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [rights, setRights] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<{ songId: string; uploadUrl: string } | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);

  const noJobsLeft = limits.jobsLeft <= 0;

  function choose(candidate: File | undefined) {
    if (!candidate) return;
    const result = checkUpload(candidate.name, candidate.size, limits.maxFileBytes);
    if (!result.ok) {
      setError(result.error ?? "That file cannot be used.");
      return;
    }
    setError(null);
    setPending(null);
    uploadDone.current = false;
    setFile(candidate);
    setTitle(titleFromFilename(candidate.name));
  }

  async function startProcessing(id: string) {
    setPhase("processing");
    const res = await fetch(`/api/songs/${id}/process`, { method: "POST" });
    if (!res.ok) {
      const failure = await readApiError(res);
      setError(failure.message);
      setPhase("uploaded");
      return;
    }
    const body = (await res.json()) as { job: JobView };
    setSongId(id);
    setJob(body.job);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || inflight.current) return;
    inflight.current = true;
    setError(null);
    try {
      let target = pending;
      if (!target) {
        setPhase("uploading");
        setProgress(0);
        const res = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size, rightsConfirmed: rights, title }),
        });
        if (!res.ok) {
          setError((await readApiError(res)).message);
          setPhase("idle");
          return;
        }
        const created = (await res.json()) as { songId: string; uploadUrl: string };
        target = { songId: created.songId, uploadUrl: created.uploadUrl };
        setPending(target);
      }

      if (!uploadDone.current) {
        setPhase("uploading");
        try {
          await withRetry(putFile(target.uploadUrl, file), setProgress);
        } catch {
          setError("The upload failed. Check your connection and try again.");
          setPhase("idle");
          return;
        }
        uploadDone.current = true;
      }
      setPhase("uploaded");
      await startProcessing(target.songId);
    } finally {
      inflight.current = false;
    }
  }

  if (job && songId) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-surface-2 p-4">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted">Uploaded. Processing runs in the background, so you can leave this page.</p>
        </div>
        <JobProgress initial={job} />
        <div className="flex flex-wrap gap-3">
          <Link href={`/dashboard/songs/${songId}`} className={buttonVariants()}>
            Open song
          </Link>
          <Link href="/dashboard/library" className={buttonVariants({ variant: "outline" })}>
            Go to library
          </Link>
        </div>
      </div>
    );
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <form onSubmit={submit} className="space-y-6">
      {noJobsLeft ? (
        <Alert tone="info">
          You have used all of your processing jobs for this month. You can still upload, but processing will start next
          month.
        </Alert>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) choose(event.dataTransfer.files[0]);
        }}
        className={cn(
          "rounded-3xl border-2 border-dashed p-8 text-center transition",
          dragging ? "border-primary bg-primary/10" : "border-line bg-surface/60",
        )}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileAudio className="h-7 w-7 text-primary" aria-hidden="true" />
            <div className="text-left">
              <p className="max-w-xs truncate font-medium">{file.name}</p>
              <p className="text-sm text-muted">{formatBytes(file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              Change
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className="h-10 w-10 text-primary" aria-hidden="true" />
            <p className="text-lg font-medium">Drag a song here or choose a file</p>
            <p className="text-sm text-muted">
              MP3, WAV, M4A or FLAC. Up to {formatBytes(limits.maxFileBytes)} and {limits.maxMinutes} minutes.
            </p>
            <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
              Choose a file
            </Button>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept=".mp3,.wav,.m4a,.flac,audio/*"
          className="sr-only"
          aria-label="Choose an audio file"
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>

      {file ? (
        <>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              maxLength={200}
              required
              disabled={busy || pending !== null}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <label className="flex items-start gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={rights}
              disabled={busy}
              onChange={(event) => setRights(event.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              I confirm that I own this song or have the right to process it. I understand that removing the vocals does
              not remove the copyright.
            </span>
          </label>
        </>
      ) : null}

      {phase === "uploading" ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Uploading</span>
            <span className="text-muted">{Math.round(progress * 100)}%</span>
          </div>
          <Progress value={progress * 100} label="Upload progress" />
        </div>
      ) : null}
      {phase === "processing" ? <p className="text-sm text-muted">Starting the processing job...</p> : null}
      {error ? <Alert>{error}</Alert> : null}

      <Button type="submit" size="lg" disabled={!file || !rights || !title.trim() || busy}>
        {busy ? "Working..." : pending ? "Try again" : "Upload and process"}
      </Button>
    </form>
  );
}
