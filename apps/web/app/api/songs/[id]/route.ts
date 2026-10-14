import { z } from "zod";
import { ApiCallError, errorResponse } from "@/lib/api";
import { parseId, proxy, readJson, requireSession } from "@/lib/route-auth";

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
    const { token } = await requireSession();
    const id = parseId((await params).id);
    return await proxy(`/v1/songs/${id}`, "DELETE", token);
  } catch (error) {
    return errorResponse(error);
  }
}
