/**
 * Best-effort in-memory rate limit (single serverless instance).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  let bucket = buckets.get(key);
  if (!bucket || nowMs >= bucket.resetAt) {
    bucket = { count: 0, resetAt: nowMs + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
    };
  }
  bucket.count += 1;
  return { ok: true };
}

/** Test hook — reset all buckets. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
