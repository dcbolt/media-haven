/**
 * Nightly / 6h-capped self-reload scheduling (F-967) — jitter persisted in
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
