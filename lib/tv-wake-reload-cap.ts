/**
 * Cross-document wake / self-heal reload cap — never reset by a good poll (F-1135).
 */

export const TV_WAKE_RELOAD_LOG_KEY = "fh_tv_wake_reload_log";
export const TV_WAKE_RELOADS_PER_HOUR = 3;
export const TV_WAKE_RELOAD_WINDOW_MS = 60 * 60_000;

/** Minimum spacing after N reloads in the window (backoff). */
export function wakeReloadBackoffMs(reloadsInWindow: number): number {
  if (reloadsInWindow <= 0) return 0;
  if (reloadsInWindow === 1) return 15 * 60_000;
  if (reloadsInWindow === 2) return 30 * 60_000;
  return 45 * 60_000;
}

export function parseWakeReloadLog(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => Number(x))
      .filter((t) => Number.isFinite(t) && t > 0);
  } catch {
    return [];
  }
}

export function pruneWakeReloadLog(
  times: number[],
  now: number,
  windowMs = TV_WAKE_RELOAD_WINDOW_MS
): number[] {
  const cutoff = now - windowMs;
  return times.filter((t) => t >= cutoff);
}

export function canAttemptWakeReload(
  times: number[],
  now: number,
  windowMs = TV_WAKE_RELOAD_WINDOW_MS,
  maxPerHour = TV_WAKE_RELOADS_PER_HOUR
): boolean {
  const recent = pruneWakeReloadLog(times, now, windowMs);
  if (recent.length >= maxPerHour) return false;
  const last = recent[recent.length - 1] ?? 0;
  const backoff = wakeReloadBackoffMs(recent.length);
  return now - last >= backoff;
}

export function readWakeReloadLog(storage: Storage | null): number[] {
  if (!storage) return [];
  try {
    return parseWakeReloadLog(storage.getItem(TV_WAKE_RELOAD_LOG_KEY));
  } catch {
    return [];
  }
}

export function recordWakeReload(
  storage: Storage | null,
  at: number,
  windowMs = TV_WAKE_RELOAD_WINDOW_MS
): void {
  if (!storage) return;
  try {
    const next = [...pruneWakeReloadLog(readWakeReloadLog(storage), at, windowMs), at];
    storage.setItem(TV_WAKE_RELOAD_LOG_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
