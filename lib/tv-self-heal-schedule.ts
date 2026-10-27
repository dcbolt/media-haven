/**
 * Nightly full reload window: ~4:00 AM America/New_York + up to 1h jitter;
 * if the TV boots after the window, fire within 6h (ROADMAP 1.7).
 */

import {
  TV_NIGHTLY_RELOAD_TZ,
  wallClockInTimeZoneToUtcMs,
  zonedCalendarDateString,
} from "./tv-timezone.ts";

export const TV_NIGHTLY_WINDOW_HOUR = 4;
export const TV_NIGHTLY_JITTER_MS = 60 * 60_000;
export const TV_NIGHTLY_POST_BOOT_CAP_MS = 6 * 3600_000;

export function msUntilNightlySelfHeal(
  nowMs: number,
  random01: () => number = Math.random,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): number {
  const jitterMs = Math.floor(random01() * TV_NIGHTLY_JITTER_MS);
  const dateKey = zonedCalendarDateString(nowMs, timeZone);
  let target =
    wallClockInTimeZoneToUtcMs(
      dateKey,
      timeZone,
      TV_NIGHTLY_WINDOW_HOUR,
      0,
      0
    ) + jitterMs;
  if (target <= nowMs) {
    const nextKey = (() => {
      const [y, m, d] = dateKey.split("-").map(Number);
      const utc = Date.UTC(y!, m! - 1, d! + 1);
      const nd = new Date(utc);
      const yy = nd.getUTCFullYear();
      const mm = String(nd.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(nd.getUTCDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    })();
    target =
      wallClockInTimeZoneToUtcMs(
        nextKey,
        timeZone,
        TV_NIGHTLY_WINDOW_HOUR,
        0,
        0
      ) + jitterMs;
  }
  const untilWindow = target - nowMs;
  return Math.min(untilWindow, TV_NIGHTLY_POST_BOOT_CAP_MS);
}
