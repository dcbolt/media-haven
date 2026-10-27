/**
 * Nightly full reload window: 4:00–5:00 AM America/New_York (wall clock + jitter).
 * Never fires outside that window — boot/outage retries wait for the next window.
 */

import {
  TV_NIGHTLY_RELOAD_TZ,
  addDaysToDateKeyInTimeZone,
  wallClockInTimeZoneToUtcMs,
  zonedCalendarDateString,
  zonedTimeParts,
} from "./tv-timezone.ts";

export const TV_NIGHTLY_WINDOW_HOUR = 4;
/** Window is [4:00, 5:00) local — jitter draws a target inside this hour. */
export const TV_NIGHTLY_WINDOW_END_HOUR = 5;
export const TV_NIGHTLY_JITTER_MS = 60 * 60_000;

export function isInNightlyReloadWindow(
  nowMs: number,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): boolean {
  const { hour } = zonedTimeParts(nowMs, timeZone);
  return hour >= TV_NIGHTLY_WINDOW_HOUR && hour < TV_NIGHTLY_WINDOW_END_HOUR;
}

export function msUntilNightlyWindowEnd(
  nowMs: number,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): number {
  if (!isInNightlyReloadWindow(nowMs, timeZone)) return 0;
  const dateKey = zonedCalendarDateString(nowMs, timeZone);
  const end = wallClockInTimeZoneToUtcMs(
    dateKey,
    timeZone,
    TV_NIGHTLY_WINDOW_END_HOUR,
    0,
    0
  );
  return Math.max(0, end - nowMs);
}

/** Next scheduled target (4:00 AM + jitter) on or after `nowMs`. */
export function nextNightlyWindowTargetUtcMs(
  nowMs: number,
  random01: () => number = Math.random,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): number {
  const jitterMs = Math.floor(random01() * TV_NIGHTLY_JITTER_MS);
  let dateKey = zonedCalendarDateString(nowMs, timeZone);
  let target =
    wallClockInTimeZoneToUtcMs(
      dateKey,
      timeZone,
      TV_NIGHTLY_WINDOW_HOUR,
      0,
      0
    ) + jitterMs;
  if (target <= nowMs) {
    dateKey = addDaysToDateKeyInTimeZone(dateKey, 1, timeZone);
    target =
      wallClockInTimeZoneToUtcMs(
        dateKey,
        timeZone,
        TV_NIGHTLY_WINDOW_HOUR,
        0,
        0
      ) + jitterMs;
  }
  return target;
}

export function msUntilNightlySelfHeal(
  nowMs: number,
  random01: () => number = Math.random,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): number {
  const target = nextNightlyWindowTargetUtcMs(nowMs, random01, timeZone);
  return Math.max(0, target - nowMs);
}

/** Retry delay while offline/failed: stay inside tonight's window or wait for next. */
export function nightlyInWindowRetryDelayMs(
  nowMs: number,
  backoffMs: number,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): number | null {
  if (!isInNightlyReloadWindow(nowMs, timeZone)) return null;
  const left = msUntilNightlyWindowEnd(nowMs, timeZone);
  if (left <= 0) return null;
  if (backoffMs < left) return backoffMs;
  return null;
}
