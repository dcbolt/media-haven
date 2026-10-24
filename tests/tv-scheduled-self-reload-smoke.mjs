/**
 * Scheduled self-reload target persistence (F-967).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  clearPersistedSelfHealTarget,
  msUntilSelfHealTarget,
  readPersistedSelfHealTargetMs,
  resolveSelfHealTargetMs,
} from "../lib/tv-scheduled-self-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const store = {};
const ls = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

const t0 = new Date("2026-10-24T12:00:00").getTime();
const delayMs = 3600_000;
const target = resolveSelfHealTargetMs(t0, ls, delayMs);
check("target persisted", readPersistedSelfHealTargetMs(ls) === target);
check(
  "reload does not reshuffle jitter",
  resolveSelfHealTargetMs(t0 + 60_000, ls, 999) === target
);
check("ms until target positive", msUntilSelfHealTarget(t0, ls, delayMs) > 0);
clearPersistedSelfHealTarget(ls);
check("clear removes target", readPersistedSelfHealTargetMs(ls) === null);

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check(
  "page uses budgeted probed reload for self-heal",
  pageSrc.includes("msUntilSelfHealTarget") &&
    pageSrc.includes('kind: "budgeted"')
);

process.exit(failed);
