/**
 * Nightly self-reload date guard (F-959).
 */
import {
  TV_NIGHTLY_RELOAD_TZ,
  localCalendarDateString,
  markNightlyReloadAttempted,
  shouldAttemptNightlyReload,
} from "../lib/tv-nightly-reload.ts";
import { wallClockInTimeZoneToUtcMs } from "../lib/tv-timezone.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const store = {};
const ls = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const noonEt = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  12,
  0,
  0
);
check("first attempt allowed", shouldAttemptNightlyReload(noonEt, ls));
markNightlyReloadAttempted(noonEt, ls);
check(
  "same ET night blocked",
  !shouldAttemptNightlyReload(noonEt + 3600_000, ls)
);
const nextEtDay = wallClockInTimeZoneToUtcMs(
  "2026-10-25",
  TV_NIGHTLY_RELOAD_TZ,
  1,
  0,
  0
);
check("next ET calendar day allowed", shouldAttemptNightlyReload(nextEtDay, ls));

check(
  "local date string uses America/New_York calendar",
  localCalendarDateString(noonEt) === "2026-10-24"
);

process.exit(failed);
