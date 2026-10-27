const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function screensaverRotationRateLimitKey(ip: string | null): string {
  return ip?.trim() || "unknown";
}

/** Returns true when the request should be rejected (429). */
export function screensaverRotationRateLimited(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

export function resetScreensaverRotationRateLimitsForTests(): void {
  buckets.clear();
}
