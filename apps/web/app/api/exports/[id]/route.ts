import { errorResponse } from "@/lib/api";
import { parseId, proxy, requireSession } from "@/lib/route-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    return await proxy(`/v1/exports/${parseId((await params).id)}`, "GET", token);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    return await proxy(`/v1/exports/${parseId((await params).id)}`, "DELETE", token);
  } catch (error) {
    return errorResponse(error);
  }
}
