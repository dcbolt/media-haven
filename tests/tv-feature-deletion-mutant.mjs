/**
 * Deletion mutants — wiring + behaviour checks must fail when features are stripped (F-979 / F-986).
 *
 *   node --experimental-strip-types --no-warnings tests/tv-feature-deletion-mutant.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  globalErrorAppBehaviorOk,
  globalErrorRetryWiringOk,
  selfReloadAppBehaviorOk,
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

check("live /tv self-reload behaviour", selfReloadAppBehaviorOk(tvPage));
check("live global-error retry behaviour", globalErrorAppBehaviorOk(globalErr));

check(
  "mutant: remove msUntilNextSelfHealTimer",
  !selfReloadAppBehaviorOk(tvPage.replaceAll("msUntilNextSelfHealTimer", ""))
);
check(
  "mutant: remove shouldAttemptNightlyReload",
  !selfReloadAppBehaviorOk(tvPage.replaceAll("shouldAttemptNightlyReload", ""))
);
check(
  "mutant: remove reloadTvIfReachable budgeted heal",
  !selfReloadAppBehaviorOk(tvPage.replaceAll("reloadTvIfReachable", ""))
);
check("mutant: empty /tv page", !selfReloadAppBehaviorOk(""));

check(
  "mutant: commented-out initial armNextTimer()",
  !selfReloadAppBehaviorOk(
    tvPage.replace("    armNextTimer();", "    // armNextTimer();")
  )
);
check(
  "mutant: block-comment msUntilNextSelfHealTimer call in armNextTimer",
  !selfReloadAppBehaviorOk(
    tvPage.replace(
      /const delay = msUntilNextSelfHealTimer\(\s*fromMs,[\s\S]*?tvSelfHealScheduleDeps\s*\);/,
      "/* msUntilNextSelfHealTimer disabled */ const delay = 1;"
    )
  )
);
check(
  "mutant: line-comment canAttemptGlobalErrorRetry in tick",
  !globalErrorAppBehaviorOk(
    globalErr.replace(
      "if (canAttemptGlobalErrorRetry(now, ss)) {",
      "// if (canAttemptGlobalErrorRetry(now, ss)) {"
    )
  )
);
check(
  "mutant: block-comment global-error-retry import",
  !globalErrorAppBehaviorOk(
    globalErr.replace(
      'from "@/lib/global-error-retry";',
      '/* from "@/lib/global-error-retry"; */'
    )
  )
);

check(
  "mutant: remove canAttemptGlobalErrorRetry identifier",
  !globalErrorAppBehaviorOk(globalErr.replaceAll("canAttemptGlobalErrorRetry", ""))
);
check(
  "mutant: remove recordGlobalErrorRetry",
  !globalErrorAppBehaviorOk(globalErr.replaceAll("recordGlobalErrorRetry", ""))
);
check("mutant: empty global-error.tsx", !globalErrorAppBehaviorOk(""));

check(
  "mutant: wiring-only strip msUntilNextSelfHealTimer",
  !selfReloadWiringOk(tvPage.replaceAll("msUntilNextSelfHealTimer", ""))
);
check(
  "mutant: wiring-only strip canAttemptGlobalErrorRetry",
  !globalErrorRetryWiringOk(globalErr.replaceAll("canAttemptGlobalErrorRetry", ""))
);

process.exit(failed);
