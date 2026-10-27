/**
 * Nightly window — America/New_York wall clock, boot/outage/DST (AUDITOR 2).
 */
import {
  TV_NIGHTLY_WINDOW_END_HOUR,
  TV_NIGHTLY_WINDOW_HOUR,
  isInNightlyReloadWindow,
  msUntilNightlySelfHeal,
  msUntilNightlyWindowEnd,
  nextNightlyWindowTargetUtcMs,
} from "../lib/tv-self-heal-schedule.ts";
import {
  TV_NIGHTLY_RELOAD_TZ,
  wallClockInTimeZoneToUtcMs,
  zonedCalendarDateString,
  zonedTimeParts,
} from "../lib/tv-timezone.ts";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

check("window is 4–5 AM ET", TV_NIGHTLY_WINDOW_HOUR === 4 && TV_NIGHTLY_WINDOW_END_HOUR === 5);

const elevenAm = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  11,
  0,
  0
);
check("11 AM ET outside nightly window", !isInNightlyReloadWindow(elevenAm));
const untilFrom11 = msUntilNightlySelfHeal(elevenAm, () => 0);
check(
  "11 AM boot waits until next 4 AM window",
  untilFrom11 > 12 * 3600_000,
  `${Math.round(untilFrom11 / 3600_000)}h`
);

const threePm = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  15,
  30,
  0
);
check("mid-afternoon recovery outside window", !isInNightlyReloadWindow(threePm));
check(
  "mid-afternoon schedules next window not same-day",
  msUntilNightlySelfHeal(threePm, () => 0) > 8 * 3600_000
);

const fourFifteen = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  4,
  15,
  0
);
check("4:15 AM ET inside window", isInNightlyReloadWindow(fourFifteen));
check(
  "window end anchored to 5 AM ET",
  msUntilNightlyWindowEnd(fourFifteen) > 0 &&
    msUntilNightlyWindowEnd(fourFifteen) <= 45 * 60_000
);

// DST fall back — Nov 1 2026 (US): 1–2 AM repeats; 4 AM is unambiguous.
const dstFallFourAm = wallClockInTimeZoneToUtcMs(
  "2026-11-01",
  TV_NIGHTLY_RELOAD_TZ,
  4,
  30,
  0
);
check(
  "DST fall-back night: 4:30 AM ET in window",
  isInNightlyReloadWindow(dstFallFourAm) &&
    zonedTimeParts(dstFallFourAm).hour === 4
);
const fallTarget = nextNightlyWindowTargetUtcMs(
  wallClockInTimeZoneToUtcMs("2026-10-31", TV_NIGHTLY_RELOAD_TZ, 23, 0, 0),
  () => 0
);
check(
  "DST fall-back: next target lands on Nov 1 calendar",
  zonedCalendarDateString(fallTarget, TV_NIGHTLY_RELOAD_TZ) === "2026-11-01"
);

// Spring forward — Mar 8 2026: 4 AM exists after skipped 2–3 AM.
const springFourAm = wallClockInTimeZoneToUtcMs(
  "2026-03-08",
  TV_NIGHTLY_RELOAD_TZ,
  4,
  20,
  0
);
check(
  "spring-forward night: 4:20 AM ET in window",
  isInNightlyReloadWindow(springFourAm)
);

check(
  "mutation: firing at 3 PM would be outside window",
  !isInNightlyReloadWindow(threePm)
);

process.exit(failed);
