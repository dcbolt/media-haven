/**
 * Deletion mutants — wiring checks must fail when features are stripped (F-979).
 *
 *   node --experimental-strip-types --no-warnings tests/tv-feature-deletion-mutant.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  globalErrorRetryWiringOk,
  selfReloadWiringOk,
} from "./tv-app-wiring-checks.mjs";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const tvPage = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
const globalErr = readFileSync(
  fileURLToPath(new URL("../app/global-error.tsx", import.meta.url)),
  "utf8"
);

check("live /tv self-reload wiring", selfReloadWiringOk(tvPage));
check("live global-error retry wiring", globalErrorRetryWiringOk(globalErr));

check(
  "mutant: remove msUntilNextSelfHealTimer",
  !selfReloadWiringOk(tvPage.replaceAll("msUntilNextSelfHealTimer", ""))
);
check(
  "mutant: remove shouldAttemptNightlyReload",
  !selfReloadWiringOk(tvPage.replaceAll("shouldAttemptNightlyReload", ""))
);
check(
  "mutant: remove reloadTvIfReachable budgeted heal",
  !selfReloadWiringOk(tvPage.replaceAll("reloadTvIfReachable", ""))
);
check("mutant: empty /tv page", !selfReloadWiringOk(""));

check(
  "mutant: remove canAttemptGlobalErrorRetry",
  !globalErrorRetryWiringOk(globalErr.replaceAll("canAttemptGlobalErrorRetry", ""))
);
check(
  "mutant: remove recordGlobalErrorRetry",
  !globalErrorRetryWiringOk(globalErr.replaceAll("recordGlobalErrorRetry", ""))
);
check("mutant: empty global-error.tsx", !globalErrorRetryWiringOk(""));

process.exit(failed);
