import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { ProcessingJob, Song } from "@karaoki/shared";
import { JobProgress } from "@/components/dashboard/job-progress";
import { SongActions } from "@/components/dashboard/song-actions";
import { SongStatusBadge } from "@/components/dashboard/status-badge";
import { KaraokePlayer } from "@/components/player/karaoke-player";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { StartProcessing } from "@/components/dashboard/start-processing";
import { KeyTempoPanel } from "@/components/player/key-tempo-panel";
import { buttonVariants } from "@/components/ui/button";
import { getSongMedia, listExports } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, timeAgo } from "@/lib/utils";
import { z } from "zod";

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: song } = await supabase
    .from("songs")
    .select("id, title, artist, status, duration_seconds, peaks, is_favorite, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!song) notFound();
  const item = song as Pick<
    Song,
    "id" | "title" | "artist" | "status" | "duration_seconds" | "peaks" | "is_favorite" | "created_at"
  >;

  const { data: jobData } = await supabase
    .from("processing_jobs")
    .select("id, song_id, status, stage, progress, error, attempt, created_at, finished_at")
    .eq("song_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  const job = ((jobData ?? [])[0] ?? null) as ProcessingJob | null;

  const { data: auth } = await supabase.auth.getUser();
  const media = item.status === "ready" ? await getSongMedia(supabase, id, item.title) : null;
  const exports = media ? await listExports(supabase, id, item.title) : [];
  const { data: lyrics } = await supabase
    .from("lyrics")
    .select("content, offset_ms")
    .eq("song_id", id)
    .maybeSingle();
  const peaks = Array.isArray(item.peaks) ? item.peaks : [];

  const { data: prefs } = await supabase.from("user_preferences").select("default_volume").maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href="/dashboard/library" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{item.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
            <SongStatusBadge status={item.status} />
            {item.duration_seconds ? <span>{formatDuration(item.duration_seconds)}</span> : null}
            <span>Added {timeAgo(item.created_at)}</span>
          </p>
        </div>
        <SongActions id={item.id} title={item.title} isFavorite={item.is_favorite} canDelete={item.status !== "processing"} />
      </header>

      <Card>
        {item.status === "ready" && media ? (
          <KaraokePlayer
            songId={item.id}
            userId={auth.user?.id ?? ""}
            lyrics={lyrics ? { content: lyrics.content as string, offset_ms: Number(lyrics.offset_ms) } : null}
            duration={item.duration_seconds ?? 0}
            peaks={peaks}
            urls={{ instrumental: media.instrumental, vocals: media.vocals, original: media.original }}
            downloads={media.downloads}
            initialVolume={prefs?.default_volume ? Number(prefs.default_volume) : undefined}
          />
        ) : null}

        {item.status === "processing" && job ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Processing your song</h2>
            <JobProgress
              initial={{ id: job.id, status: job.status, stage: job.stage, progress: job.progress, error: job.error }}
            />
          </div>
        ) : null}

        {item.status === "failed" ? (
          <div className="space-y-4">
            <Alert>{job?.error ?? "Processing failed."}</Alert>
            {job ? (
              <JobProgress
                initial={{ id: job.id, status: job.status === "failed" ? "failed" : "canceled", stage: job.stage, progress: job.progress, error: job.error }}
              />
            ) : null}
          </div>
        ) : null}

        {item.status === "uploaded" ? (
          <div className="space-y-4">
            <p className="text-muted">This song is uploaded but has not been processed yet.</p>
            <StartProcessing songId={item.id} />
          </div>
        ) : null}

        {item.status === "uploading" ? (
          <p className="text-muted">
            This upload has not finished. If you left the page during the upload, delete this entry and upload the song
            again.
          </p>
        ) : null}
      </Card>

      {item.status === "ready" && media ? (
        <>
          <KeyTempoPanel songId={item.id} hasVocals={Boolean(media.vocals)} initialExports={exports} />
          <div className="flex justify-center">
            <Link href={`/dashboard/studio/${item.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Record over this song
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
