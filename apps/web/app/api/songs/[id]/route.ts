import { z } from "zod";
import { ApiCallError, errorResponse } from "@/lib/api";
import { parseId, readJson, requireSession } from "@/lib/route-auth";

const patchSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(200).optional(),
    isFavorite: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.isFavorite !== undefined, "Nothing to update");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireSession();
    const id = parseId((await params).id);
    const body = await readJson(request, patchSchema);
    const changes: Record<string, unknown> = {};
    if (body.title !== undefined) changes.title = body.title;
    if (body.isFavorite !== undefined) changes.is_favorite = body.isFavorite;

    const { data, error } = await supabase
      .from("songs")
      .update(changes)
      .eq("id", id)
      .select("id, title, is_favorite")
      .maybeSingle();
    if (error) throw new ApiCallError(500, "update_failed", "Could not save your changes");
    if (!data) throw new ApiCallError(404, "not_found", "Song not found");
    return Response.json({ song: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireSession();
    const id = parseId((await params).id);

    const { data: song } = await supabase.from("songs").select("id, status").eq("id", id).maybeSingle();
    if (!song) throw new ApiCallError(404, "not_found", "Song not found");
    if (song.status === "processing") {
      throw new ApiCallError(409, "job_in_progress", "Cancel the processing job before deleting this song");
    }

    const { data: files } = await supabase.from("audio_files").select("bucket, path").eq("song_id", id);
    const byBucket = new Map<string, string[]>();
    for (const file of (files ?? []) as { bucket: string; path: string }[]) {
      byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
    }
    for (const [bucket, paths] of byBucket) {
      const removed = await supabase.storage.from(bucket).remove(paths);
      if (removed.error) {
        throw new ApiCallError(502, "storage_failed", "Could not remove the song files, try again");
      }
    }

    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) throw new ApiCallError(500, "delete_failed", "Could not delete the song");
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
