export const ALLOWED_EXTENSIONS = ["mp3", "wav", "m4a", "flac"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const SONG_STATUSES = ["uploading", "uploaded", "processing", "ready", "failed"] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

export const JOB_STATUSES = ["queued", "processing", "completed", "failed", "canceled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AUDIO_KINDS = ["original", "instrumental", "vocals", "recording", "mix"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];

export interface PlanLimits {
  id: string;
  name: string;
  monthlyJobs: number;
  maxStorageBytes: number;
  maxFileBytes: number;
  maxDurationSeconds: number;
}

export const FREE_PLAN: PlanLimits = {
  id: "free",
  name: "Free",
  monthlyJobs: 3,
  maxStorageBytes: 500 * 1024 * 1024,
  maxFileBytes: 50 * 1024 * 1024,
  maxDurationSeconds: 600,
};

export const STAGE_LABELS: Record<string, string> = {
  starting: "Starting",
  downloading: "Fetching your file",
  validating: "Checking the audio",
  preparing: "Preparing the track",
  separating: "Separating vocals",
  encoding: "Encoding stems",
  uploading: "Saving results",
  done: "Done",
};

export interface Song {
  id: string;
  user_id: string;
  title: string;
  artist: string | null;
  original_filename: string | null;
  status: SongStatus;
  duration_seconds: number | null;
  peaks: number[] | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface AudioFile {
  id: string;
  song_id: string;
  kind: AudioKind;
  bucket: string;
  path: string;
  format: string;
  size_bytes: number;
  duration_seconds: number | null;
}

export interface ProcessingJob {
  id: string;
  song_id: string;
  status: JobStatus;
  stage: string | null;
  progress: number | null;
  error: string | null;
  attempt: number;
  created_at: string;
  finished_at: string | null;
}

export const isActiveJob = (status: JobStatus): boolean =>
  status === "queued" || status === "processing";
