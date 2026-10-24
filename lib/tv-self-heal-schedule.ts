/** Nightly full reload window: 3:00–4:00 AM local + 6h cap if booted after window. */

export function msUntilNightlySelfHeal(
  nowMs: number,
  random01: () => number = Math.random
): number {
  const now = new Date(nowMs);
  const target = new Date(nowMs);
  target.setHours(3, 0, 0, 0);
  const jitterMs = Math.floor(random01() * 60 * 60_000);
  target.setTime(target.getTime() + jitterMs);
  if (target.getTime() <= nowMs) {
    target.setDate(target.getDate() + 1);
  }
  const untilWindow = target.getTime() - nowMs;
  return Math.min(untilWindow, 6 * 3600_000);
}
