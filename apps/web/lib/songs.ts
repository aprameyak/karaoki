import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProcessingJob, Song } from "@karaoki/shared";

export const PAGE_SIZE = 12;

export type SongSort = "new" | "old" | "title";

export interface LibraryQuery {
  q: string;
  sort: SongSort;
  favorites: boolean;
  page: number;
}

export function parseLibraryQuery(params: Record<string, string | string[] | undefined>): LibraryQuery {
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const sort = pick("sort");
  const page = Number.parseInt(pick("page") ?? "1", 10);
  return {
    q: (pick("q") ?? "").trim().slice(0, 100),
    sort: sort === "old" || sort === "title" ? sort : "new",
    favorites: pick("fav") === "1",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function libraryHref(query: LibraryQuery, overrides: Partial<LibraryQuery> = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.sort !== "new") params.set("sort", merged.sort);
  if (merged.favorites) params.set("fav", "1");
  if (merged.page > 1) params.set("page", String(merged.page));
  const text = params.toString();
  return text ? `/dashboard/library?${text}` : "/dashboard/library";
}

export const SONG_COLUMNS = "id, title, artist, status, duration_seconds, is_favorite, created_at, updated_at";

export type SongListItem = Pick<
  Song,
  "id" | "title" | "artist" | "status" | "duration_seconds" | "is_favorite" | "created_at" | "updated_at"
>;

export async function listSongs(
  supabase: SupabaseClient,
  query: LibraryQuery,
): Promise<{ songs: SongListItem[]; total: number }> {
  let request = supabase.from("songs").select(SONG_COLUMNS, { count: "exact" });
  if (query.q) request = request.ilike("title", `%${escapeLike(query.q)}%`);
  if (query.favorites) request = request.eq("is_favorite", true);
  if (query.sort === "title") request = request.order("title", { ascending: true });
  else request = request.order("created_at", { ascending: query.sort === "old" });
  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count } = await request.range(from, from + PAGE_SIZE - 1);
  return { songs: (data ?? []) as SongListItem[], total: count ?? 0 };
}

export async function latestJobs(
  supabase: SupabaseClient,
  songIds: string[],
): Promise<Map<string, ProcessingJob>> {
  const jobs = new Map<string, ProcessingJob>();
  if (songIds.length === 0) return jobs;
  const { data } = await supabase
    .from("processing_jobs")
    .select("id, song_id, status, stage, progress, error, attempt, created_at, finished_at")
    .in("song_id", songIds)
    .order("created_at", { ascending: false });
  for (const job of (data ?? []) as ProcessingJob[]) {
    if (!jobs.has(job.song_id)) jobs.set(job.song_id, job);
  }
  return jobs;
}
