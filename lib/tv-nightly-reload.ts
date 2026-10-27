/**
 * Scheduled self-reload at ~4am America/New_York — once per calendar night (F-959).
 */

import {
  TV_NIGHTLY_RELOAD_TZ,
  zonedCalendarDateString,
} from "./tv-timezone.ts";

export const NIGHTLY_RELOAD_DATE_KEY = "fh_tv_nightly_reload_date";

export { TV_NIGHTLY_RELOAD_TZ };

export function localCalendarDateString(
  nowMs: number,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): string {
  return zonedCalendarDateString(nowMs, timeZone);
}

export function shouldAttemptNightlyReload(
  nowMs: number,
  ls: Storage | null
): boolean {
  if (!ls) return true;
  try {
    const today = localCalendarDateString(nowMs);
    return ls.getItem(NIGHTLY_RELOAD_DATE_KEY) !== today;
  } catch {
    return true;
  }
}

export function markNightlyReloadAttempted(
  nowMs: number,
  ls: Storage | null
): void {
  if (!ls) return;
  try {
    ls.setItem(NIGHTLY_RELOAD_DATE_KEY, localCalendarDateString(nowMs));
  } catch {
    /* private mode */
  }
}
