import { z } from "zod";
import { ApiCallError, errorResponse } from "@/lib/api";
import { allow } from "@/lib/rate-limit";
import { parseId, readJson, requireSession } from "@/lib/route-auth";

const bodySchema = z.object({ extension: z.enum(["webm", "ogg", "m4a", "wav"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireSession();
    const songId = parseId((await params).id);
    if (!allow(`take-upload:${user.id}`, 30, 60_000)) {
      throw new ApiCallError(429, "rate_limited", "You are going too fast. Wait a moment and try again.");
    }
    const { extension } = await readJson(request, bodySchema);

    const { data: song } = await supabase.from("songs").select("id, status").eq("id", songId).maybeSingle();
    if (!song) throw new ApiCallError(404, "not_found", "Song not found");
    if (song.status !== "ready") {
      throw new ApiCallError(409, "not_ready", "Process this song before recording over it");
    }

    const name = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const path = `${user.id}/${songId}/take-${name}.${extension}`;
    const signed = await supabase.storage.from("recordings").createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      throw new ApiCallError(500, "upload_url_failed", "Could not prepare the upload");
    }
    return Response.json({ path, uploadUrl: signed.data.signedUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
