import { z } from "zod";
import { ApiCallError, callApi, errorResponse, readError } from "@/lib/api";
import { allow } from "@/lib/rate-limit";
import { internalHeaders, readJson } from "@/lib/route-auth";

const bodySchema = z.object({
  reporterName: z.string().trim().min(1, "Enter your name").max(200),
  reporterEmail: z.email("Enter a valid email address").max(254),
  workDescription: z.string().trim().min(10, "Describe the copyrighted work").max(2000),
  locationDescription: z.string().trim().min(10, "Describe where it appears").max(2000),
  statementAccepted: z.literal(true, { error: "You must accept the statement" }),
});

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (forwarded !== "unknown" && !allow(`copyright:${forwarded}`, 5, 60 * 60 * 1000)) {
      throw new ApiCallError(429, "rate_limited", "Too many reports from this address, try again later");
    }
    const body = await readJson(request, bodySchema);
    const res = await callApi("/v1/copyright-reports", {
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
