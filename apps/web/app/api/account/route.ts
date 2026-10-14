import { errorResponse } from "@/lib/api";
import { proxy, requireSession } from "@/lib/route-auth";

export async function DELETE() {
  try {
    const { supabase, token } = await requireSession();
    const res = await proxy("/v1/account", "DELETE", token);
    await supabase.auth.signOut().catch(() => undefined);
    return res;
  } catch (error) {
    return errorResponse(error);
  }
}
