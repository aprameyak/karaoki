import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/origin";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (isSameOriginRequest(request.method, request.headers)) return NextResponse.next();
    return NextResponse.json(
      { error: { code: "forbidden_origin", message: "This request did not come from Karaoki" } },
      { status: 403 },
    );
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/admin/:path*", "/login", "/signup", "/auth/:path*", "/reset-password"],
};
