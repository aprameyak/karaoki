import { PLAN_CATALOG } from "@karaoki/shared";
import { z } from "zod";
import { ApiCallError, errorResponse } from "@/lib/api";
import { readJson, requireSession } from "@/lib/route-auth";
import { checkUpload, extensionOf, originalPath, sanitizeFilename, titleFromFilename } from "@/lib/upload";

const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  size: z.number().int().positive(),
  rightsConfirmed: z.literal(true, { error: "Confirm that you have the right to use this song" }),
  title: z.string().trim().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireSession();
    const body = await readJson(request, bodySchema);

    const ext = extensionOf(body.filename);
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_id, plans(max_file_bytes)")
      .eq("id", user.id)
      .single();
    const plans = profile?.plans as { max_file_bytes: number } | { max_file_bytes: number }[] | null | undefined;
    const planLimit = Array.isArray(plans) ? plans[0]?.max_file_bytes : plans?.max_file_bytes;
    const maxBytes = planLimit ?? PLAN_CATALOG.free.maxFileBytes;

    const check = checkUpload(body.filename, body.size, Number(maxBytes));
    if (!check.ok || !ext) {
      throw new ApiCallError(422, "invalid_file", check.error ?? "That file cannot be used");
    }

    const filename = sanitizeFilename(body.filename);
    const { data: song, error } = await supabase
      .from("songs")
      .insert({
        user_id: user.id,
        title: body.title ?? titleFromFilename(filename),
        original_filename: filename,
        rights_confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !song) {
      throw new ApiCallError(500, "create_failed", "Could not start the upload");
    }

    const path = originalPath(user.id, song.id, ext);
    const signed = await supabase.storage.from("originals").createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      await supabase.from("songs").delete().eq("id", song.id);
      throw new ApiCallError(500, "upload_url_failed", "Could not prepare the upload");
    }

    return Response.json({ songId: song.id, path, uploadUrl: signed.data.signedUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
