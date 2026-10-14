import Link from "next/link";
import { Star } from "lucide-react";
import type { ProcessingJob } from "@karaoki/shared";
import { JobProgress } from "@/components/dashboard/job-progress";
import { SongStatusBadge } from "@/components/dashboard/status-badge";
import type { SongListItem } from "@/lib/songs";
import { formatDuration, timeAgo } from "@/lib/utils";

export function SongRow({
  song,
  job,
  actions,
}: {
  song: SongListItem;
  job?: ProcessingJob;
  actions?: React.ReactNode;
}) {
  const active = song.status === "processing" && job && (job.status === "queued" || job.status === "processing");
  return (
    <li className="rounded-2xl border border-line bg-surface/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/dashboard/songs/${song.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-medium">
            {song.is_favorite ? <Star className="h-4 w-4 shrink-0 fill-accent text-accent" aria-label="Favorite" /> : null}
            <span className="truncate">{song.title}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {song.duration_seconds ? `${formatDuration(song.duration_seconds)} · ` : ""}
            {timeAgo(song.created_at)}
          </p>
        </Link>
        <SongStatusBadge status={song.status} />
        {actions}
      </div>
      {active && job ? (
        <div className="mt-4">
          <JobProgress
            compact
            initial={{ id: job.id, status: job.status, stage: job.stage, progress: job.progress, error: job.error }}
          />
        </div>
      ) : null}
    </li>
  );
}
