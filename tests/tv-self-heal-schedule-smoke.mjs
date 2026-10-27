/**
 * Nightly self-heal schedule (~4 AM America/New_York + 6h boot cap).
 */
import {
  TV_NIGHTLY_JITTER_MS,
  TV_NIGHTLY_POST_BOOT_CAP_MS,
  TV_NIGHTLY_WINDOW_HOUR,
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
check("post-boot cap is 6h", TV_NIGHTLY_POST_BOOT_CAP_MS === 6 * 3600_000);

const beforeWindow = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  2,
  0,
  0
);
const delay = msUntilNightlySelfHeal(beforeWindow, () => 0);
check("delay before 4am is positive", delay > 0);
check("delay before 4am under 6h cap", delay <= TV_NIGHTLY_POST_BOOT_CAP_MS);

const afterWindow = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  5,
  0,
  0
);
const delayNext = msUntilNightlySelfHeal(afterWindow, () => 0);
check("after window schedules next night", delayNext > 60 * 60_000);

check(
  "mutation: zero cap would allow >6h wait",
  msUntilNightlySelfHeal(beforeWindow, () => 0) <= TV_NIGHTLY_POST_BOOT_CAP_MS
);

process.exit(failed);
