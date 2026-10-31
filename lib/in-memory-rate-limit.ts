/**
 * Best-effort in-memory rate limit (single serverless instance).
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function bucketFor(
  key: string,
  windowMs: number,
  nowMs: number
): Bucket {
  let bucket = buckets.get(key);
  if (!bucket || nowMs >= bucket.resetAt) {
    bucket = { count: 0, resetAt: nowMs + windowMs };
    buckets.set(key, bucket);
  }
  return bucket;
}

/** Read-only — does not increment (F-3265 pre-DB reject guard). */
export function peekRateLimit(
  key: string,
  max: number,
  windowMs: number,
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = bucketFor(key, windowMs, nowMs);
  if (bucket.count >= max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
    };
  }
  return { ok: true };
}

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = bucketFor(key, windowMs, nowMs);
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
