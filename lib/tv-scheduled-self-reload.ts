/**
 * Nightly / 6h-capped self-reload scheduling (F-967 / F-974) — jitter persisted in
 * localStorage so a budgeted reload does not reshuffle the fleet window.
 */

export const TV_SELF_HEAL_TARGET_MS_KEY = "fh_tv_self_heal_target_ms";

export function readPersistedSelfHealTargetMs(
  ls: Storage | null
): number | null {
  if (!ls) return null;
  try {
    const raw = ls.getItem(TV_SELF_HEAL_TARGET_MS_KEY);
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writePersistedSelfHealTargetMs(
  ls: Storage | null,
  targetMs: number
): void {
  if (!ls) return;
  try {
    ls.setItem(TV_SELF_HEAL_TARGET_MS_KEY, String(targetMs));
  } catch {
    /* private mode */
  }
}

/** Absolute epoch ms when the next self-heal reload should fire. */
export function resolveSelfHealTargetMs(
  nowMs: number,
  ls: Storage | null,
  delayMs: number
): number {
  const existing = readPersistedSelfHealTargetMs(ls);
  if (existing !== null && existing > nowMs) return existing;
  const target = nowMs + delayMs;
  writePersistedSelfHealTargetMs(ls, target);
  return target;
}

export function msUntilSelfHealTarget(
  nowMs: number,
  ls: Storage | null,
  delayMs: number
): number {
  const target = resolveSelfHealTargetMs(nowMs, ls, delayMs);
  return Math.max(0, target - nowMs);
}

/** After a successful budgeted reload, schedule the next window. */
export function clearPersistedSelfHealTarget(ls: Storage | null): void {
  if (!ls) return;
  try {
    ls.removeItem(TV_SELF_HEAL_TARGET_MS_KEY);
  } catch {
    /* ignore */
  }
}

export function startOfNextLocalDayMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export type SelfHealScheduleDeps = {
  canAttemptTonight: (nowMs: number, ls: Storage | null) => boolean;
  nightlyDelayMs: (nowMs: number) => number;
};

/** Delay until the next self-heal timer should fire (never "stop"). */
export function msUntilNextSelfHealTimer(
  nowMs: number,
  ls: Storage | null,
  deps: SelfHealScheduleDeps
): number {
  if (!deps.canAttemptTonight(nowMs, ls)) {
    const nextDay = startOfNextLocalDayMs(nowMs);
    clearPersistedSelfHealTarget(ls);
    const target = resolveSelfHealTargetMs(
      nextDay,
      ls,
      deps.nightlyDelayMs(nextDay)
    );
    return Math.max(0, target - nowMs);
  }
  return msUntilSelfHealTarget(nowMs, ls, deps.nightlyDelayMs(nowMs));
}
