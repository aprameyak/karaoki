import { errorResponse } from "@/lib/api";
import { parseId, proxy, requireSession } from "@/lib/route-auth";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    const { id } = await params;
    return await proxy(`/v1/songs/${parseId(id)}/process`, "POST", token);
  } catch (error) {
    return errorResponse(error);
  }
}
