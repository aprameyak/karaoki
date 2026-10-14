import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiCallError, callApi, readError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export interface Session {
  supabase: SupabaseClient;
  user: User;
  token: string;
}

export async function requireSession(): Promise<Session> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    throw new ApiCallError(401, "unauthorized", "Sign in to continue");
  }
  const { data: sessionData } = await supabase.auth.getSession();
  return { supabase, user: data.user, token: sessionData.session?.access_token ?? "" };
}

export function parseId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw new ApiCallError(404, "not_found", "Not found");
  }
  return parsed.data;
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiCallError(400, "invalid_request", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  return parsed.data;
}

export async function proxy(
  path: string,
  method: "GET" | "POST" | "DELETE",
  token: string,
  body?: unknown,
): Promise<Response> {
  const res = await callApi(path, { method, token, body });
  if (!res.ok) throw await readError(res);
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
