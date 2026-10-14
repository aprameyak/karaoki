import { ApiCallError, errorResponse } from "@/lib/api";
import { downloadName } from "@/lib/media";
import { parseId, proxy, requireSession } from "@/lib/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireSession();
    const id = parseId((await params).id);
    const { data: recording } = await supabase
      .from("recordings")
      .select("id, song_id, title, status, error, offset_ms, vocal_gain, backing_gain, mix_file_id, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!recording) throw new ApiCallError(404, "not_found", "Recording not found");

    let mixUrl: string | null = null;
    if (recording.status === "ready" && recording.mix_file_id) {
      const { data: file } = await supabase
        .from("audio_files")
        .select("bucket, path")
        .eq("id", recording.mix_file_id)
        .maybeSingle();
      if (file) {
        const signed = await supabase.storage
          .from(file.bucket as string)
          .createSignedUrl(file.path as string, 3600, {
            download: downloadName(String(recording.title), "mix", "mp3"),
          });
        mixUrl = signed.data?.signedUrl ?? null;
      }
    }
    return Response.json({ recording: { ...recording, mix_url: mixUrl } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    return await proxy(`/v1/recordings/${parseId((await params).id)}`, "DELETE", token);
  } catch (error) {
    return errorResponse(error);
  }
}
