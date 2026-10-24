/** 429 retry policy — total sleep stays well under Vercel's 60s function limit. */

export const GUESTY_429_MAX_ATTEMPTS = 6;
export const GUESTY_429_MAX_TOTAL_SLEEP_MS = 45_000;

export function guesty429SleepMs(attempt: number): number {
  return Math.min(10_000, 1000 * 2 ** attempt);
}

export function guesty429ShouldRetry(
  attempt: number,
  totalSleepMs: number
): boolean {
  if (attempt >= GUESTY_429_MAX_ATTEMPTS) return false;
  const delay = guesty429SleepMs(attempt);
  return totalSleepMs + delay <= GUESTY_429_MAX_TOTAL_SLEEP_MS;
}
