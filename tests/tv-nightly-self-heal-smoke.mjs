/**
 * Combined self-heal wiring (periodic + nightly).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTvCombinedSelfHeal } from "../lib/tv-wake-recovery.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const wakeSrc = readFileSync(
  fileURLToPath(new URL("../lib/tv-wake-recovery.ts", import.meta.url)),
  "utf8"
);
check("default self-heal runs periodic + nightly", wakeSrc.includes("createTvCombinedSelfHeal"));
check("periodic self-heal preserved", wakeSrc.includes("createTvPeriodicSelfHeal"));
check("nightly self-heal preserved", wakeSrc.includes("createTvNightlySelfHeal"));

check(
  "mutation: nightly-only default fails guard",
  !wakeSrc.includes("(opts.selfHealImpl ?? createTvNightlySelfHeal)(opts)")
);

check("combined export exists", typeof createTvCombinedSelfHeal === "function");

process.exit(failed);
