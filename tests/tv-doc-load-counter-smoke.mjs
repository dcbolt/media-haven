/**
 * /tv document load counter middleware (F-956 / F-970).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tvHarnessLoadCounterEnabled } from "../lib/tv-harness-middleware.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const middlewareSrc = readFileSync(
  fileURLToPath(new URL("../middleware.ts", import.meta.url)),
  "utf8"
);
const harnessSrc = readFileSync(
  fileURLToPath(new URL("../lib/tv-harness-middleware.ts", import.meta.url)),
  "utf8"
);

check(
  "counter helper off when VERCEL_ENV is production",
  harnessSrc.includes('VERCEL_ENV !== "production"') &&
    tvHarnessLoadCounterEnabled() === (process.env.VERCEL_ENV !== "production")
);
check(
  "middleware gates counter with tvHarnessLoadCounterEnabled",
  middlewareSrc.includes("tvHarnessLoadCounterEnabled()")
);
check("reset query param supported", middlewareSrc.includes("__tv_load_reset"));

process.exit(failed);
