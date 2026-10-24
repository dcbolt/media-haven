/**
 * Scheduled self-reload at ~4am — at most once per local calendar night (F-959).
 */

export const NIGHTLY_RELOAD_DATE_KEY = "fh_tv_nightly_reload_date";

export function localCalendarDateString(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
