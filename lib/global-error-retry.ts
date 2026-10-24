/**
 * Global error boundary auto-retry backoff (F-969).
 */

const FIRST_DELAY_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000];

export function globalErrorRetryDelayMs(attemptIndex: number): number {
  const pick =
    BACKOFF_MS[Math.min(attemptIndex, BACKOFF_MS.length - 1)] ?? MAX_BACKOFF_MS;
  return Math.min(pick, MAX_BACKOFF_MS);
}

export function globalErrorFirstRetryDelayMs(): number {
  return FIRST_DELAY_MS;
}
