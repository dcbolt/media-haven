/**
 * Synthetic crash query gated off production (F-962).
 */
import { tvSyntheticCrashFromQuery } from "../lib/tv-synthetic-crash.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "no flag → off",
  !tvSyntheticCrashFromQuery("?device=x")
);
check(
  "flag alone → follows harness env (non-browser)",
  tvSyntheticCrashFromQuery("?__tv_crash=1") ===
    (process.env.NODE_ENV !== "production")
);

process.exit(failed);
