/** Pure freeze / heartbeat thresholds (Node-safe for smokes). */

export const TV_WAKE_HEARTBEAT_MS = 5_000;
export const TV_WAKE_FREEZE_GAP_MS = 60_000;
export const TV_WAKE_RELOAD_DEBOUNCE_MS = 45_000;

export function heartbeatGapIndicatesFreeze(
  previousBeatAt: number,
  now: number,
  gapMs = TV_WAKE_FREEZE_GAP_MS
): boolean {
  if (!Number.isFinite(previousBeatAt) || previousBeatAt <= 0) return false;
  return now - previousBeatAt > gapMs;
}
