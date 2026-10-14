import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { parseId, proxy, readJson, requireSession } from "@/lib/route-auth";

const bodySchema = z.object({ status: z.string().min(1).max(20) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { token } = await requireSession();
    const id = parseId((await params).id);
    const body = await readJson(request, bodySchema);
    return await proxy(`/v1/admin/reports/${id}`, "POST", token, body);
  } catch (error) {
    return errorResponse(error);
  }
}
