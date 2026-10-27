/** Pure freeze / heartbeat thresholds (Node-safe for smokes). */

export const TV_WAKE_HEARTBEAT_MS = 5_000;
export const TV_WAKE_FREEZE_GAP_MS = 60_000;
export const TV_WAKE_RELOAD_DEBOUNCE_MS = 45_000;
/** Visibility / pageshow / resume need hidden at least this long unless heartbeat gap. */
export const TV_WAKE_MIN_HIDDEN_MS = 30_000;

export const TV_WAKE_LAST_RELOAD_STORAGE_KEY = "fh_tv_wake_reload_at";

export function heartbeatGapIndicatesFreeze(
  previousBeatAt: number,
  now: number,
  gapMs = TV_WAKE_FREEZE_GAP_MS
): boolean {
  if (!Number.isFinite(previousBeatAt) || previousBeatAt <= 0) return false;
  return now - previousBeatAt > gapMs;
}

export function wakeHeartbeatReloadAllowed(
  lastBeatAt: number,
  now: number,
  documentHidden: boolean,
  gapMs = TV_WAKE_FREEZE_GAP_MS
): boolean {
  if (documentHidden) return false;
  return heartbeatGapIndicatesFreeze(lastBeatAt, now, gapMs);
}

export function readWakeReloadTimestamp(storage: Storage | null): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(TV_WAKE_LAST_RELOAD_STORAGE_KEY);
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeWakeReloadTimestamp(
  storage: Storage | null,
  at: number
): void {
  if (!storage) return;
  try {
    storage.setItem(TV_WAKE_LAST_RELOAD_STORAGE_KEY, String(at));
  } catch {
    /* private mode */
  }
}

export function wakeReloadDebounced(
  lastAttemptAt: number,
  now: number,
  debounceMs = TV_WAKE_RELOAD_DEBOUNCE_MS
): boolean {
  if (!Number.isFinite(lastAttemptAt) || lastAttemptAt <= 0) return true;
  return now - lastAttemptAt >= debounceMs;
}
