/**
 * Error-boundary reload execution (F-951) — browser reload after cap + probe.
 */

import {
  canAttemptErrorRecoveryReload,
  recordErrorRecoveryReload,
} from "./tv-error-recovery-policy";
import { probeTvStateReachable } from "./tv-reload";

export {
  ERROR_RECOVERY_LOG_KEY,
  canAttemptErrorRecoveryReload,
  errorRecoveryDelayMs,
  errorRecoveryTimings,
  pruneErrorRecoveryTimestamps,
  readErrorRecoveryLog,
  recordErrorRecoveryReload,
  resetErrorRecoveryLog,
} from "./tv-error-recovery-policy";

/** Returns true when a full reload was started (cap + probe both satisfied). */
export async function attemptErrorRecoveryReload(
  deviceId: string | null,
  previewProperty: string | null,
  nowMs: number = Date.now(),
  ss: Parameters<typeof recordErrorRecoveryReload>[1] = undefined
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!canAttemptErrorRecoveryReload(nowMs, ss ?? null)) return false;
  const ok = await probeTvStateReachable(deviceId, previewProperty);
  if (!ok) return false;
  recordErrorRecoveryReload(nowMs, ss ?? null);
  window.location.reload();
  return true;
}
