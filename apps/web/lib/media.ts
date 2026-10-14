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


export interface ExportItem {
  id: string;
  source: "instrumental" | "vocals";
  semitones: number;
  tempo: number;
  preview: boolean;
  status: "completed";
  error: null;
  download_url: string | null;
}

interface ExportRow {
  id: string;
  source: "instrumental" | "vocals";
  semitones: number;
  tempo: number | string;
  audio_file_id: string | null;
}

export async function listExports(
  supabase: SupabaseClient,
  songId: string,
  title: string,
): Promise<ExportItem[]> {
  const { data } = await supabase
    .from("audio_exports")
    .select("id, source, semitones, tempo, audio_file_id")
    .eq("song_id", songId)
    .eq("preview", false)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (data ?? []) as ExportRow[];
  const ids = rows.map((row) => row.audio_file_id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  const { data: files } = await supabase.from("audio_files").select("id, bucket, path").in("id", ids);
  const byId = new Map(((files ?? []) as { id: string; bucket: string; path: string }[]).map((f) => [f.id, f]));

  const items: ExportItem[] = [];
  for (const row of rows) {
    const file = row.audio_file_id ? byId.get(row.audio_file_id) : undefined;
    if (!file) continue;
    const name = downloadName(`${title} ${row.semitones >= 0 ? "+" : ""}${row.semitones} ${Number(row.tempo)}x`, row.source, "mp3");
    const signed = await supabase.storage.from(file.bucket).createSignedUrl(file.path, TTL_SECONDS, { download: name });
    items.push({
      id: row.id,
      source: row.source,
      semitones: row.semitones,
      tempo: Number(row.tempo),
      preview: false,
      status: "completed",
      error: null,
      download_url: signed.data?.signedUrl ?? null,
    });
  }
  return items;
}


export interface RecordingItem {
  id: string;
  title: string;
  status: "uploaded" | "mixing" | "ready" | "failed";
  error: string | null;
  offset_ms: number;
  vocal_gain: number;
  backing_gain: number;
  mix_url: string | null;
}

interface RecordingRow {
  id: string;
  title: string;
  status: RecordingItem["status"];
  error: string | null;
  offset_ms: number;
  vocal_gain: number | string;
  backing_gain: number | string;
  mix_file_id: string | null;
}

export async function listRecordings(supabase: SupabaseClient, songId: string): Promise<RecordingItem[]> {
  const { data } = await supabase
    .from("recordings")
    .select("id, title, status, error, offset_ms, vocal_gain, backing_gain, mix_file_id")
    .eq("song_id", songId)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as RecordingRow[];
  const ids = rows.map((row) => row.mix_file_id).filter((id): id is string => Boolean(id));
  const files = new Map<string, { bucket: string; path: string }>();
  if (ids.length > 0) {
    const { data: found } = await supabase.from("audio_files").select("id, bucket, path").in("id", ids);
    for (const file of (found ?? []) as { id: string; bucket: string; path: string }[]) files.set(file.id, file);
  }
  const items: RecordingItem[] = [];
  for (const row of rows) {
    const file = row.mix_file_id ? files.get(row.mix_file_id) : undefined;
    let mixUrl: string | null = null;
    if (row.status === "ready" && file) {
      const signed = await supabase.storage.from(file.bucket).createSignedUrl(file.path, TTL_SECONDS, {
        download: `${row.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim() || "take"}.mp3`,
      });
      mixUrl = signed.data?.signedUrl ?? null;
    }
    items.push({
      id: row.id,
      title: row.title,
      status: row.status,
      error: row.error,
      offset_ms: row.offset_ms,
      vocal_gain: Number(row.vocal_gain),
      backing_gain: Number(row.backing_gain),
      mix_url: mixUrl,
    });
  }
  return items;
}
