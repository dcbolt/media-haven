/**
 * Scheduled self-reload scheduling (F-967 / F-974 / F-979 wiring).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  selfReloadAppBehaviorOk,
  selfReloadWiringOk,
} from "./tv-app-wiring-checks.mjs";
import {
  clearPersistedSelfHealTarget,
  msUntilSelfHealTarget,
  readPersistedSelfHealTargetMs,
  resolveSelfHealTargetMs,
} from "../lib/tv-scheduled-self-reload.ts";
import {
  msUntilNextSelfHealTimer,
  startOfNextLocalDayMs,
} from "../lib/tv-scheduled-self-reload.ts";
import { msUntilNightlySelfHeal } from "../lib/tv-self-heal-schedule.ts";
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

const tvPageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check("/tv wires scheduled self-reload behaviour", selfReloadAppBehaviorOk(tvPageSrc));
check(
  "deletion mutant: timer hook removed fails behaviour",
  !selfReloadAppBehaviorOk(tvPageSrc.replaceAll("msUntilNextSelfHealTimer", ""))
);
check(
  "deletion mutant: initial armNextTimer() removed fails behaviour",
  !selfReloadAppBehaviorOk(
    tvPageSrc.replace(/\barmNextTimer\s*\(\s*\)\s*;\s*\n\s*return\s*\(\)/, "return ()")
  )
);
check(
  "deletion mutant: commented initial armNextTimer() fails behaviour",
  !selfReloadAppBehaviorOk(tvPageSrc.replace("    armNextTimer();", "    // armNextTimer();"))
);
check(
  "F-989: wiring passes when initial armNextTimer() removed",
  selfReloadWiringOk(
    tvPageSrc.replace(/\barmNextTimer\s*\(\s*\)\s*;\s*\n\s*return\s*\(\)/, "return ()")
  ) &&
    !selfReloadAppBehaviorOk(
      tvPageSrc.replace(/\barmNextTimer\s*\(\s*\)\s*;\s*\n\s*return\s*\(\)/, "return ()")
    )
);

const deps = {
  canAttemptTonight: shouldAttemptNightlyReload,
  nightlyDelayMs: (t) => msUntilNightlySelfHeal(t, () => 0),
};

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

const t0 = new Date("2026-10-24T12:00:00").getTime();
const delayMs = 3600_000;
const target = resolveSelfHealTargetMs(t0, ls, delayMs);
check("target persisted", readPersistedSelfHealTargetMs(ls) === target);
check(
  "reload does not reshuffle jitter",
  resolveSelfHealTargetMs(t0 + 60_000, ls, 999) === target
);
check("ms until target positive", msUntilSelfHealTarget(t0, ls, delayMs) > 0);
clearPersistedSelfHealTarget(ls);
check("clear removes target", readPersistedSelfHealTargetMs(ls) === null);

{
  for (const k of Object.keys(store)) delete store[k];
  const noon = new Date("2026-10-24T14:00:00").getTime();
  markNightlyReloadAttempted(noon, ls);
  const afterReloadSameDay = msUntilNextSelfHealTimer(noon + 1000, ls, deps);
  const firesAt = noon + 1000 + afterReloadSameDay;
  check(
    "same-day early return still schedules next window",
    afterReloadSameDay > 60_000 &&
      firesAt >= startOfNextLocalDayMs(noon)
  );
  for (const k of Object.keys(store)) delete store[k];
}

function simulateSelfHealReloadsForDays(startMs, dayCount, storage, scheduleDeps) {
  const reloadsByLocalDate = [];
  let nowMs = startMs;
  let steps = 0;
  while (reloadsByLocalDate.length < dayCount && steps < dayCount * 30) {
    steps += 1;
    if (shouldAttemptNightlyReload(nowMs, storage)) {
      markNightlyReloadAttempted(nowMs, storage);
      clearPersistedSelfHealTarget(storage);
      reloadsByLocalDate.push(localCalendarDateString(nowMs));
      nowMs += 1;
    }
    const wait = msUntilNextSelfHealTimer(nowMs, storage, scheduleDeps);
    nowMs += wait > 0 ? wait : 60_000;
  }
  return reloadsByLocalDate;
}

{
  const start = new Date("2026-01-01T08:00:00").getTime();
  const dates = simulateSelfHealReloadsForDays(start, 7, ls, deps);
  check("seven-day sim fires once per night", dates.length === 7);
  check("seven distinct local dates", new Set(dates).size === 7);
}

process.exit(failed);
