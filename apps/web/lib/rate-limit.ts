const windows = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (windows.size > 10_000) windows.clear();
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function resetRateLimits(): void {
  windows.clear();
}
