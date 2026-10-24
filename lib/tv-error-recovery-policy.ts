/**
 * Error-boundary reload pacing rules (F-951) — no imports (Node smoke safe).
 */

export const ERROR_RECOVERY_LOG_KEY = "fh_tv_err_recovery_ts";

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_PER_WINDOW = 3;
const DEFAULT_FIRST_DELAY_MS = 30_000;
const DEFAULT_MAX_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_BACKOFF_MS = [
  30_000,
  60_000,
  120_000,
  300_000,
  600_000,
  900_000,
];

export type ErrorRecoveryTimings = {
  firstDelayMs: number;
  windowMs: number;
  maxPerWindow: number;
  backoffMs: number[];
  maxBackoffMs: number;
};

function sessionStorageSafe(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
    const g = globalThis as typeof globalThis & { sessionStorage?: Storage };
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function errorRecoveryTimings(): ErrorRecoveryTimings {
  const fast =
    typeof globalThis !== "undefined" &&
    Boolean(
      (globalThis as { __TV_ERROR_RECOVERY_FAST__?: boolean })
        .__TV_ERROR_RECOVERY_FAST__
    );
  if (fast) {
    return {
      firstDelayMs: 50,
      windowMs: 10_000,
      maxPerWindow: 3,
      backoffMs: [50, 100, 150, 200, 250, 300],
      maxBackoffMs: 300,
    };
  }
  return {
    firstDelayMs: DEFAULT_FIRST_DELAY_MS,
    windowMs: DEFAULT_WINDOW_MS,
    maxPerWindow: DEFAULT_MAX_PER_WINDOW,
    backoffMs: DEFAULT_BACKOFF_MS,
    maxBackoffMs: DEFAULT_MAX_BACKOFF_MS,
  };
}

export function pruneErrorRecoveryTimestamps(
  timestamps: number[],
  nowMs: number,
  windowMs: number
): number[] {
  return timestamps.filter((t) => nowMs - t < windowMs);
}

export function readErrorRecoveryLog(
  ss: Storage | null,
  nowMs: number
): number[] {
  const { windowMs } = errorRecoveryTimings();
  if (!ss) return [];
  try {
    const raw = ss.getItem(ERROR_RECOVERY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return pruneErrorRecoveryTimestamps(
      parsed.filter((n) => typeof n === "number"),
      nowMs,
      windowMs
    );
  } catch {
    return [];
  }
}

export function writeErrorRecoveryLog(
  ss: Storage | null,
  timestamps: number[]
): void {
  if (!ss) return;
  try {
    ss.setItem(ERROR_RECOVERY_LOG_KEY, JSON.stringify(timestamps));
  } catch {
    /* private mode */
  }
}

export function canAttemptErrorRecoveryReload(
  nowMs: number,
  ss: Storage | null = sessionStorageSafe()
): boolean {
  const { windowMs, maxPerWindow } = errorRecoveryTimings();
  const log = readErrorRecoveryLog(ss, nowMs);
  return log.length < maxPerWindow;
}

export function recordErrorRecoveryReload(
  nowMs: number,
  ss: Storage | null = sessionStorageSafe()
): void {
  const { windowMs } = errorRecoveryTimings();
  const next = pruneErrorRecoveryTimestamps(
    [...readErrorRecoveryLog(ss, nowMs), nowMs],
    nowMs,
    windowMs
  );
  writeErrorRecoveryLog(ss, next);
}

export function resetErrorRecoveryLog(
  ss: Storage | null = sessionStorageSafe()
): void {
  if (!ss) return;
  try {
    ss.removeItem(ERROR_RECOVERY_LOG_KEY);
  } catch {
    /* ignore */
  }
}

export function errorRecoveryDelayMs(attemptIndex: number): number {
  const { backoffMs, maxBackoffMs } = errorRecoveryTimings();
  const pick =
    backoffMs[Math.min(attemptIndex, backoffMs.length - 1)] ?? maxBackoffMs;
  return Math.min(pick, maxBackoffMs);
}
