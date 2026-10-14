import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudioFile } from "@karaoki/shared";

export interface SongMedia {
  original: string | null;
  instrumental: string | null;
  vocals: string | null;
  downloads: { instrumental: string | null; vocals: string | null };
  files: Pick<AudioFile, "kind" | "size_bytes" | "format">[];
}

export function downloadName(title: string, kind: "instrumental" | "vocals", format: string): string {
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "song";
  return `${safe} (${kind}).${format}`;
}

const TTL_SECONDS = 3600;

type StemKind = "original" | "instrumental" | "vocals";

interface AudioRow {
  kind: string;
  bucket: string;
  path: string;
  size_bytes: number;
  format: string;
}

const isStemKind = (kind: string): kind is StemKind =>
  kind === "original" || kind === "instrumental" || kind === "vocals";

export async function getSongMedia(
  supabase: SupabaseClient,
  songId: string,
  title: string,
): Promise<SongMedia> {
  const { data } = await supabase
    .from("audio_files")
    .select("kind, bucket, path, size_bytes, format")
    .eq("song_id", songId);

  const media: SongMedia = {
    original: null,
    instrumental: null,
    vocals: null,
    downloads: { instrumental: null, vocals: null },
    files: [],
  };
  for (const file of (data ?? []) as AudioRow[]) {
    if (!isStemKind(file.kind)) continue;
    const signed = await supabase.storage.from(file.bucket).createSignedUrl(file.path, TTL_SECONDS);
    media[file.kind] = signed.data?.signedUrl ?? null;
    if (file.kind === "instrumental" || file.kind === "vocals") {
      const download = await supabase.storage
        .from(file.bucket)
        .createSignedUrl(file.path, TTL_SECONDS, { download: downloadName(title, file.kind, file.format) });
      media.downloads[file.kind] = download.data?.signedUrl ?? null;
    }
    media.files.push({ kind: file.kind, size_bytes: file.size_bytes, format: file.format });
  }
  return media;
}
