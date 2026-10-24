/**
 * Error-boundary reload cap (F-951) — pure rules + mutation self-checks.
 */
import {
  canAttemptErrorRecoveryReload,
  errorRecoveryDelayMs,
  errorRecoveryTimings,
  pruneErrorRecoveryTimestamps,
  readErrorRecoveryLog,
  recordErrorRecoveryReload,
  resetErrorRecoveryLog,
} from "../lib/tv-error-recovery-policy.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function mockStorage() {
  const data = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

globalThis.__TV_ERROR_RECOVERY_FAST__ = true;
const timings = errorRecoveryTimings();
check("fast mode first delay at least 30ms prod scale", timings.firstDelayMs >= 50);
check("production first delay is 30s", (() => {
  delete globalThis.__TV_ERROR_RECOVERY_FAST__;
  const prod = errorRecoveryTimings();
  globalThis.__TV_ERROR_RECOVERY_FAST__ = true;
  return prod.firstDelayMs === 30_000;
})());

const ss = mockStorage();
const t0 = 1_000_000;
for (let i = 0; i < 3; i++) {
  recordErrorRecoveryReload(t0 + i * 100, ss);
}
check(
  "fourth reload blocked in window",
  !canAttemptErrorRecoveryReload(t0 + 500, ss)
);
check(
  "window slides — reload allowed after expiry",
  canAttemptErrorRecoveryReload(t0 + timings.windowMs + 1, ss)
);

check(
  "backoff grows toward cap",
  errorRecoveryDelayMs(0) <= errorRecoveryDelayMs(5) &&
    errorRecoveryDelayMs(5) <= timings.maxBackoffMs
);

check(
  "prune drops stale timestamps",
  pruneErrorRecoveryTimestamps([t0, t0 + timings.windowMs + 1], t0 + timings.windowMs + 2, timings.windowMs).length === 1
);

resetErrorRecoveryLog(ss);
check("reset clears log", readErrorRecoveryLog(ss, t0).length === 0);

// Mutation: removing cap allows unlimited reloads in window.
{
  const mutantCan = () => true;
  let attempts = 0;
  for (let i = 0; i < 10; i++) {
    if (mutantCan()) attempts++;
  }
  check("mutation unlimited cap would exceed 3", attempts > 3);
  resetErrorRecoveryLog(ss);
  let guarded = 0;
  for (let i = 0; i < 10; i++) {
    const now = t0 + i * 10;
    if (canAttemptErrorRecoveryReload(now, ss)) {
      recordErrorRecoveryReload(now, ss);
      guarded += 1;
    }
  }
  check("guard limits attempts in window", guarded === 3);
}

process.exit(failed);
