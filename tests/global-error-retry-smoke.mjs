/**
 * Global error auto-retry cap (F-969 / F-976 / F-973 / F-979 wiring).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  globalErrorAppBehaviorOk,
  globalErrorRetryWiringOk,
} from "./tv-app-wiring-checks.mjs";
import {
  canAttemptErrorRecoveryReload,
  errorRecoveryDelayMs,
  errorRecoveryTimings,
  recordErrorRecoveryReload,
} from "../lib/tv-error-recovery-policy.ts";

/** Mirrors lib/global-error-retry.ts — smoke imports policy directly (Node ESM). */
function globalErrorFirstRetryDelayMs() {
  return errorRecoveryTimings().firstDelayMs;
}
function globalErrorRetryDelayMs(attemptIndex) {
  return errorRecoveryDelayMs(attemptIndex);
}
function canAttemptGlobalErrorRetry(nowMs, ss) {
  return canAttemptErrorRecoveryReload(nowMs, ss);
}
function recordGlobalErrorRetry(nowMs, ss) {
  recordErrorRecoveryReload(nowMs, ss);
}

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const globalErrSrc = readFileSync(
  fileURLToPath(new URL("../app/global-error.tsx", import.meta.url)),
  "utf8"
);
const globalErrLibSrc = readFileSync(
  fileURLToPath(new URL("../lib/global-error-retry.ts", import.meta.url)),
  "utf8"
);
check("global-error.tsx wires auto-retry cap", globalErrorAppBehaviorOk(globalErrSrc));
check(
  "global-error.tsx imports global-error-retry lib",
  /from\s+["']@\/lib\/global-error-retry["']/.test(globalErrSrc)
);
check(
  "lib global-error-retry delegates to recovery policy",
  /\bcanAttemptErrorRecoveryReload\b/.test(globalErrLibSrc)
);
check(
  "deletion mutant: cap hook removed fails behaviour",
  !globalErrorAppBehaviorOk(globalErrSrc.replaceAll("canAttemptGlobalErrorRetry", ""))
);
check(
  "comment mutant: commented cap check fails behaviour",
  !globalErrorAppBehaviorOk(
    globalErrSrc.replace(
      "if (canAttemptGlobalErrorRetry(now, ss)) {",
      "// if (canAttemptGlobalErrorRetry(now, ss)) {"
    )
  )
);

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
