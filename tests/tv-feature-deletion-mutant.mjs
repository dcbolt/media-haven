/**
 * Deletion mutants — wiring + behaviour checks (F-979 / F-986 / F-989).
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
  "mutant: delete initial armNextTimer() only",
  !selfReloadAppBehaviorOk(
    tvPage.replace(/\barmNextTimer\s*\(\s*\)\s*;\s*\n\s*return\s*\(\)/, "return ()")
  )
);
check(
  "mutant: commented-out initial armNextTimer()",
  !selfReloadAppBehaviorOk(
    tvPage.replace("    armNextTimer();", "    // armNextTimer();")
  )
);

check(
  "mutant: remove canAttemptGlobalErrorRetry",
  !globalErrorAppBehaviorOk(globalErr.replaceAll("canAttemptGlobalErrorRetry", ""))
);
check(
  "mutant: delete auto reset() in tick",
  !globalErrorAppBehaviorOk(
    globalErr.replace(
      /if\s*\(\s*canAttemptGlobalErrorRetry\(now,\s*ss\)\)\s*\{\s*\n\s*recordGlobalErrorRetry\(now,\s*ss\);\s*\n\s*reset\(\);\s*\n\s*\}/,
      "if (canAttemptGlobalErrorRetry(now, ss)) {\n        recordGlobalErrorRetry(now, ss);\n      }"
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

check("mutant: empty /tv page", !selfReloadAppBehaviorOk(""));
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
