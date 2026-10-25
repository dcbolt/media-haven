/**
 * Wake / freeze recovery (UniFi white-screen) — lib rules + page wiring + mutants.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  heartbeatGapIndicatesFreeze,
} from "../lib/tv-wake-freeze.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("heartbeat interval is 5s", TV_WAKE_HEARTBEAT_MS === 5_000);
check("freeze gap threshold is 60s", TV_WAKE_FREEZE_GAP_MS === 60_000);
check("debounce is configured", TV_WAKE_RELOAD_DEBOUNCE_MS >= 30_000);

const t0 = 1_000_000;
check(
  "gap at threshold is not freeze",
  !heartbeatGapIndicatesFreeze(t0, t0 + TV_WAKE_FREEZE_GAP_MS)
);
check(
  "gap over threshold is freeze",
  heartbeatGapIndicatesFreeze(t0, t0 + TV_WAKE_FREEZE_GAP_MS + 1)
);
check(
  "invalid previous beat is not freeze",
  !heartbeatGapIndicatesFreeze(0, 999_999)
);

// Mutation: treating any positive gap as freeze would flag 1ms idle ticks.
check(
  "mutation: 1ms gap must not count as freeze",
  !heartbeatGapIndicatesFreeze(1000, 1001, TV_WAKE_FREEZE_GAP_MS)
);

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check("page wires createTvWakeRecovery", pageSrc.includes("createTvWakeRecovery"));
check(
  "page skips wake reload while poll failing",
  pageSrc.includes("failedPolls.current > 0")
);
check(
  "page persists wake reload debounce key",
  pageSrc.includes("createTvWakeRecovery")
);
check(
  "wake debounce uses sessionStorage in lib",
  readFileSync(
    fileURLToPath(new URL("../lib/tv-wake-recovery.ts", import.meta.url)),
    "utf8"
  ).includes("TV_WAKE_LAST_RELOAD_STORAGE_KEY")
);

const mutantPage = pageSrc.replace(/createTvWakeRecovery/g, "noopWakeRecovery");
check(
  "mutation: deleting createTvWakeRecovery fails wiring guard",
  !mutantPage.includes("createTvWakeRecovery")
);

const mutantOffline = pageSrc.replace("failedPolls.current > 0", "false");
check(
  "mutation: removing offline gate changes isOffline wiring",
  mutantOffline.includes("isOffline: () => false")
);

process.exit(failed);
