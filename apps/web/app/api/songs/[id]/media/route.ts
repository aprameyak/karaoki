import { ApiCallError, errorResponse } from "@/lib/api";
import { getSongMedia } from "@/lib/media";
import { parseId, requireSession } from "@/lib/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireSession();
    const id = parseId((await params).id);
    const { data: song } = await supabase.from("songs").select("title").eq("id", id).maybeSingle();
    if (!song) throw new ApiCallError(404, "not_found", "Song not found");
    const media = await getSongMedia(supabase, id, song.title as string);
    return Response.json(media, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
