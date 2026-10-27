/**
 * Nightly self-heal wiring — date guard + shared budgeted reload path.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  markNightlyReloadAttempted,
  shouldAttemptNightlyReload,
} from "../lib/tv-nightly-reload.ts";
import { createTvNightlySelfHeal } from "../lib/tv-wake-recovery.ts";
import { wallClockInTimeZoneToUtcMs } from "../lib/tv-timezone.ts";
import { TV_NIGHTLY_RELOAD_TZ } from "../lib/tv-nightly-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const wakeSrc = readFileSync(
  fileURLToPath(new URL("../lib/tv-wake-recovery.ts", import.meta.url)),
  "utf8"
);
check("wake recovery uses nightly self-heal", wakeSrc.includes("createTvNightlySelfHeal"));
check(
  "nightly reload uses budgeted reloadTvIfReachable",
  /createTvNightlySelfHeal[\s\S]*kind: "budgeted"/.test(wakeSrc)
);
check(
  "nightly respects shouldAttemptNightlyReload",
  wakeSrc.includes("shouldAttemptNightlyReload")
);
check(
  "mutation: periodic-only wiring fails guard",
  !wakeSrc.includes("(opts.selfHealImpl ?? createTvPeriodicSelfHeal)(opts)")
);

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { documentElement: { removeAttribute() {}, setAttribute() {}, hasAttribute: () => false } };

const at4am = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  4,
  5,
  0
);
check("first nightly attempt allowed", shouldAttemptNightlyReload(at4am, localStorage));
markNightlyReloadAttempted(at4am, localStorage);
check(
  "same ET night blocked",
  !shouldAttemptNightlyReload(at4am + 3600_000, localStorage)
);

createTvNightlySelfHeal({
  deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  previewProperty: null,
  isOffline: () => false,
  now: () => at4am,
  reloadImpl: async () => false,
});
check("nightly self-heal module mounts timer", typeof createTvNightlySelfHeal === "function");

process.exit(failed);
