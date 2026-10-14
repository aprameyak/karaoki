import { apiUrl } from "@/lib/env";

export class ApiCallError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface CallOptions {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export async function callApi(path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${apiUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ApiCallError(503, "api_unavailable", "The processing service is unavailable right now");
  }
}

export async function readError(res: Response): Promise<ApiCallError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiCallError(
      res.status,
      body.error?.code ?? "error",
      body.error?.message ?? "Something went wrong",
    );
  } catch {
    return new ApiCallError(res.status, "error", "Something went wrong");
  }
}

export async function apiJson<T>(path: string, options: CallOptions = {}): Promise<T> {
  const res = await callApi(path, options);
  if (!res.ok) throw await readError(res);
  return (await res.json()) as T;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiCallError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  );
}
