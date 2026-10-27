/**
 * Nightly self-heal schedule (~4 AM America/New_York, no boot catch-up).
 */
import {
  TV_NIGHTLY_JITTER_MS,
  TV_NIGHTLY_WINDOW_HOUR,
  isInNightlyReloadWindow,
  msUntilNightlySelfHeal,
} from "../lib/tv-self-heal-schedule.ts";
import { wallClockInTimeZoneToUtcMs } from "../lib/tv-timezone.ts";
import { TV_NIGHTLY_RELOAD_TZ } from "../lib/tv-nightly-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("nightly window hour is 4 ET", TV_NIGHTLY_WINDOW_HOUR === 4);
check("jitter is 1h max", TV_NIGHTLY_JITTER_MS === 60 * 60_000);

const beforeWindow = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  2,
  0,
  0
);
const delay = msUntilNightlySelfHeal(beforeWindow, () => 0);
check("delay before 4am is positive", delay > 0);
check("delay before 4am is under ~2h", delay <= 2 * 3600_000);

const afterWindow = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  5,
  0,
  0
);
const delayNext = msUntilNightlySelfHeal(afterWindow, () => 0);
check("after window schedules next night", delayNext > 12 * 3600_000);
check("5 AM ET outside window", !isInNightlyReloadWindow(afterWindow));

const elevenAm = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  11,
  0,
  0
);
check(
  "mutation: 11 AM boot does not reload before next 4 AM window",
  msUntilNightlySelfHeal(elevenAm, () => 0) > 12 * 3600_000
);

process.exit(failed);
