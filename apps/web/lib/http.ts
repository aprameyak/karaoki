import { readApiError } from "@/lib/messages";

export interface Outcome {
  ok: boolean;
  res: Response | null;
  message: string;
}

export const OFFLINE_MESSAGE = "Could not reach the server. Check your connection and try again.";

export async function send(input: string, init?: RequestInit): Promise<Outcome> {
  try {
    const res = await fetch(input, init);
    if (res.ok) return { ok: true, res, message: "" };
    return { ok: false, res, message: (await readApiError(res)).message };
  } catch {
    return { ok: false, res: null, message: OFFLINE_MESSAGE };
  }
}

export function postJson(input: string, body?: unknown, method: "POST" | "DELETE" | "PATCH" = "POST"): Promise<Outcome> {
  return send(input, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
