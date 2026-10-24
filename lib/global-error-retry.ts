/**
 * Global error boundary auto-retry backoff (F-969 / F-976).
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
