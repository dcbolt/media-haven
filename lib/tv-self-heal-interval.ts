/** Jittered periodic self-reload every 4–6 h (ROADMAP 1.7 / supersedes #158 nightly). */

export const TV_SELF_HEAL_MIN_MS = 4 * 3600_000;
export const TV_SELF_HEAL_JITTER_MS = 2 * 3600_000;

export function msUntilPeriodicSelfHeal(
  nowMs: number,
  random01: () => number = Math.random
): number {
  const jitter = Math.floor(random01() * TV_SELF_HEAL_JITTER_MS);
  return TV_SELF_HEAL_MIN_MS + jitter;
}
