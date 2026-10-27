/** America/New_York — FH fleet nightly reload calendar (F-959 / ROADMAP 1.7). */

export const TV_NIGHTLY_RELOAD_TZ = "America/New_York";

/** `YYYY-MM-DD` in the given IANA time zone. */
export function zonedCalendarDateString(
  nowMs: number,
  timeZone = TV_NIGHTLY_RELOAD_TZ
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

/** UTC ms for a wall-clock time on `dateKey` in `timeZone`. */
export function wallClockInTimeZoneToUtcMs(
  dateKey: string,
  timeZone: string,
  hour: number,
  minute: number,
  second = 0
): number {
  const wantH = hour;
  const wantM = minute;
  const wantS = second;
  let guess = Date.parse(`${dateKey}T12:00:00.000Z`);
  for (let i = 0; i < 48; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(new Date(guess));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    const s = Number(parts.find((p) => p.type === "second")?.value ?? 0);
    const deltaSec = (wantH - h) * 3600 + (wantM - m) * 60 + (wantS - s);
    if (deltaSec === 0) return guess;
    guess += deltaSec * 1000;
  }
  return guess;
}
