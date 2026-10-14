import { callApi, errorResponse, readError } from "@/lib/api";
import { requireSession } from "@/lib/route-auth";

export async function GET() {
  try {
    const { token } = await requireSession();
    const res = await callApi("/v1/account/export", { token });
    if (!res.ok) throw await readError(res);
    return new Response(await res.text(), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="karaoki-export.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
