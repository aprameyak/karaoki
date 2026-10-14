import { errorResponse } from "@/lib/api";
import { parseId, proxy, requireSession } from "@/lib/route-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    const id = parseId((await params).id);
    const body = await request.json().catch(() => ({}));
    return await proxy(`/v1/songs/${id}/recordings`, "POST", token, body);
  } catch (error) {
    return errorResponse(error);
  }
}
