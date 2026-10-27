/**
 * Coordinates periodic (4–6 h) and nightly (~4 AM ET) self-reload (F-2134).
 */

import {
  TV_WAKE_RELOAD_WINDOW_MS,
  pruneWakeReloadLog,
} from "./tv-wake-reload-cap.ts";

/** Skip nightly when a budgeted reload succeeded within this window. */
export const TV_NIGHTLY_DEFER_AFTER_RELOAD_MS = 60 * 60_000;

export function shouldDeferNightlyAfterRecentReload(
  reloadTimes: number[],
  nowMs: number,
  deferMs = TV_NIGHTLY_DEFER_AFTER_RELOAD_MS,
  windowMs = TV_WAKE_RELOAD_WINDOW_MS
): boolean {
  const recent = pruneWakeReloadLog(reloadTimes, nowMs, windowMs);
  const cutoff = nowMs - deferMs;
  return recent.some((t) => t >= cutoff);
}

/** Exponential backoff when nightly probe/reload fails (server down). */
export const TV_NIGHTLY_PROBE_BACKOFF_BASE_MS = 60_000;
export const TV_NIGHTLY_PROBE_BACKOFF_MAX_MS = 30 * 60_000;

export function nightlyProbeBackoffMs(failedAttempts: number): number {
  if (failedAttempts <= 0) return TV_NIGHTLY_PROBE_BACKOFF_BASE_MS;
  const exp = TV_NIGHTLY_PROBE_BACKOFF_BASE_MS * 2 ** (failedAttempts - 1);
  return Math.min(TV_NIGHTLY_PROBE_BACKOFF_MAX_MS, exp);
}
