/**
 * Nightly self-reload date guard (F-959).
 */
import {
  localCalendarDateString,
  markNightlyReloadAttempted,
  shouldAttemptNightlyReload,
} from "../lib/tv-nightly-reload.ts";

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

const noon = new Date("2026-10-24T12:00:00").getTime();
check("first attempt allowed", shouldAttemptNightlyReload(noon, ls));
markNightlyReloadAttempted(noon, ls);
check(
  "same local night blocked",
  !shouldAttemptNightlyReload(noon + 3600_000, ls)
);
check(
  "next local calendar day allowed",
  shouldAttemptNightlyReload(new Date("2026-10-25T01:00:00").getTime(), ls)
);

check(
  "local date string uses local calendar",
  localCalendarDateString(noon) === "2026-10-24"
);

process.exit(failed);
