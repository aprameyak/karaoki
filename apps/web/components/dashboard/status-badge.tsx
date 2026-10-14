import type { JobStatus, SongStatus } from "@karaoki/shared";
import { Badge } from "@/components/ui/badge";

const SONG: Record<SongStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  uploading: { label: "Uploading", tone: "neutral" },
  uploaded: { label: "Not processed", tone: "neutral" },
  processing: { label: "Processing", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

export function SongStatusBadge({ status }: { status: SongStatus }) {
  const { label, tone } = SONG[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function isFinished(status: JobStatus): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}
