"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileAudio, UploadCloud, X } from "lucide-react";
import { PLAN_CATALOG } from "@karaoki/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { checkUpload } from "@/lib/upload";
import { cn, formatBytes } from "@/lib/utils";

export function UploadTeaser() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function choose(candidate: File | undefined) {
    if (!candidate) return;
    const result = checkUpload(candidate.name, candidate.size, PLAN_CATALOG.free.maxFileBytes);
    if (!result.ok) {
      setFile(null);
      setError(result.error ?? "That file cannot be used.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
        className={cn(
          "rounded-3xl border-2 border-dashed p-8 text-center transition",
          dragging ? "border-primary bg-primary/10" : "border-line bg-surface/60",
        )}
      >
        {file ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <FileAudio className="h-6 w-6 text-primary" aria-hidden="true" />
              <div className="text-left">
                <p className="max-w-[16rem] truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="rounded-full p-1 text-muted hover:text-ink"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted">
              Looks good. Create a free account and Karaoki will upload and process it for you.
            </p>
            <Link href="/signup?next=/dashboard/upload" className={buttonVariants({ size: "lg" })}>
              Create karaoke free
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <UploadCloud className="h-10 w-10 text-primary" aria-hidden="true" />
            <div>
              <p className="text-lg font-medium">Drop a song here</p>
              <p className="mt-1 text-sm text-muted">MP3, WAV, M4A or FLAC up to {formatBytes(PLAN_CATALOG.free.maxFileBytes)}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
              Choose a file
            </Button>
            <input
              ref={input}
              type="file"
              accept=".mp3,.wav,.m4a,.flac,audio/*"
              className="sr-only"
              aria-label="Choose an audio file"
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </div>
        )}
      </div>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      <p className="mt-3 text-center text-xs text-muted">
        Your file stays on your device until you sign in. Only upload music you have the right to use.
      </p>
    </div>
  );
}
