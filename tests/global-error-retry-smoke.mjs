/**
 * Global error auto-retry cap (F-969 / F-976 / F-973).
 */
import {
  canAttemptGlobalErrorRetry,
  globalErrorFirstRetryDelayMs,
  globalErrorRetryDelayMs,
  recordGlobalErrorRetry,
} from "../lib/global-error-retry.ts";
import { errorRecoveryTimings } from "../lib/tv-error-recovery-policy.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const ss = {};
globalThis.sessionStorage = {
  getItem: (k) => ss[k] ?? null,
  setItem: (k, v) => {
    ss[k] = String(v);
  },
  removeItem: (k) => {
    delete ss[k];
  },
};

delete globalThis.__TV_ERROR_RECOVERY_FAST__;
check(
  "first retry uses production recovery first delay",
  globalErrorFirstRetryDelayMs() === errorRecoveryTimings().firstDelayMs
);
check(
  "backoff grows",
  globalErrorRetryDelayMs(0) <= globalErrorRetryDelayMs(3)
);

const t0 = 1_000_000;
let allowed = 0;
for (let i = 0; i < 10; i++) {
  const now = t0 + i * 100;
  if (canAttemptGlobalErrorRetry(now, globalThis.sessionStorage)) {
    recordGlobalErrorRetry(now, globalThis.sessionStorage);
    allowed += 1;
  }
}
check("shared recovery cap limits global retries", allowed === 3);
check(
  "fourth global retry blocked",
  !canAttemptGlobalErrorRetry(t0 + 500, globalThis.sessionStorage)
);

globalThis.__TV_ERROR_RECOVERY_FAST__ = true;

process.exit(failed);
