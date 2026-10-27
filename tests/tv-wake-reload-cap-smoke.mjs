/**
 * F-1135 — wake reload hourly cap (never reset by poll).
 */
import {
  TV_WAKE_RELOADS_PER_HOUR,
  canAttemptWakeReload,
  recordWakeReload,
  readWakeReloadLog,
} from "../lib/tv-wake-reload-cap.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const store = {};
const storage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
};

check("empty log allows reload", canAttemptWakeReload([], 1_000_000));
for (let i = 0; i < TV_WAKE_RELOADS_PER_HOUR; i++) {
  recordWakeReload(storage, 1_000_000 + i * 60_000);
}
check(
  "fourth reload blocked in same hour",
  !canAttemptWakeReload(readWakeReloadLog(storage), 1_200_000)
);

process.exit(failed);
