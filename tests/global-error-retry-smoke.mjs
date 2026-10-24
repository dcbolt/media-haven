/**
 * Global error auto-retry backoff (F-969).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  globalErrorFirstRetryDelayMs,
  globalErrorRetryDelayMs,
} from "../lib/global-error-retry.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("first retry at 30s", globalErrorFirstRetryDelayMs() === 30_000);
check(
  "backoff grows",
  globalErrorRetryDelayMs(0) <= globalErrorRetryDelayMs(3)
);
check("backoff capped", globalErrorRetryDelayMs(99) <= 15 * 60 * 1000);

const src = readFileSync(
  fileURLToPath(new URL("../app/global-error.tsx", import.meta.url)),
  "utf8"
);
check(
  "global-error schedules automatic reset",
  src.includes("globalErrorFirstRetryDelayMs") &&
    src.includes("__FH_GLOBAL_ERR_RETRY__")
);

process.exit(failed);
