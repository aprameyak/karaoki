const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOriginRequest(method: string, headers: Headers): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
