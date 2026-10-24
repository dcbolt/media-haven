/**
 * Global error boundary auto-retry backoff (F-969 / F-976 / F-987).
 *
 * **Shared /tv reload budget:** `canAttemptGlobalErrorRetry` /
 * `recordGlobalErrorRetry` delegate to `tv-error-recovery-policy` and use the
 * same sessionStorage log (`fh_tv_err_recovery_ts`) as `/tv` segment error
 * boundaries — max **3** recovery attempts per **10 minute** window with shared
 * backoff. A global-error `reset()` counts against that cap; it does **not**
 * use the separate budgeted poll/nightly counter (`fh_tv_auto_reload_count` in
 * `lib/tv-reload.ts`).
 */

import {
  canAttemptErrorRecoveryReload,
  errorRecoveryDelayMs,
  errorRecoveryTimings,
  recordErrorRecoveryReload,
} from "./tv-error-recovery-policy";

export function globalErrorFirstRetryDelayMs(): number {
  return errorRecoveryTimings().firstDelayMs;
}

export function globalErrorRetryDelayMs(attemptIndex: number): number {
  return errorRecoveryDelayMs(attemptIndex);
}

export function canAttemptGlobalErrorRetry(
  nowMs: number,
  ss: Storage | null
): boolean {
  return canAttemptErrorRecoveryReload(nowMs, ss);
}

export function recordGlobalErrorRetry(nowMs: number, ss: Storage | null): void {
  recordErrorRecoveryReload(nowMs, ss);
}
