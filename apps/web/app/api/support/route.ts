import { z } from "zod";
import { ApiCallError, callApi, errorResponse, readError } from "@/lib/api";
import { allow } from "@/lib/rate-limit";
import { internalHeaders, readJson } from "@/lib/route-auth";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(200),
  email: z.email("Enter a valid email address").max(254),
  message: z.string().trim().min(10, "Write at least a sentence").max(5000),
});

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (forwarded !== "unknown" && !allow(`support:${forwarded}`, 5, 60 * 60 * 1000)) {
      throw new ApiCallError(429, "rate_limited", "Too many messages from this address, try again later");
    }
    const body = await readJson(request, bodySchema);
    const res = await callApi("/v1/support-requests", {
      method: "POST",
      headers: internalHeaders(forwarded),
      body,
    });
    if (!res.ok) throw await readError(res);
    return Response.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
