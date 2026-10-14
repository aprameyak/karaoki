import { errorResponse } from "@/lib/api";
import { parseId, proxy, requireSession } from "@/lib/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    return await proxy(`/v1/jobs/${parseId((await params).id)}`, "GET", token);
  } catch (error) {
    return errorResponse(error);
  }
}
