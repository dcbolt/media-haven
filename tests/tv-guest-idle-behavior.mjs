/**
 * Guest-busy deferral + freeze bypass (AUDITOR 2).
 */
import {
  TV_GUEST_BUSY_MAX_DEFER_MS,
  isTvReloadIdle,
  setTvGuestBusy,
} from "../lib/tv-reload-idle.ts";
import {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
} from "../lib/tv-wake-freeze.ts";
import { createTvWakeRecovery } from "../lib/tv-wake-recovery.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const store = {};
globalThis.sessionStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};

globalThis.document = {
  hidden: false,
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
  documentElement: {
    attrs: new Set(),
    setAttribute(k) {
      this.attrs.add(k);
    },
    removeAttribute(k) {
      this.attrs.delete(k);
    },
    hasAttribute(k) {
      return this.attrs.has(k);
    },
  },
};
globalThis.window = { sessionStorage: globalThis.sessionStorage };

let nowMs = 1_000_000;
const timers = new Map();
let seq = 0;
globalThis.setTimeout = (fn, ms) => {
  const id = ++seq;
  timers.set(id, { fn, ms, last: nowMs });
  return id;
};
globalThis.clearTimeout = (id) => timers.delete(id);

function fireTimers(advanceMs) {
  nowMs += advanceMs;
  for (const t of timers.values()) {
    while (nowMs - t.last >= t.ms) {
      t.last += t.ms;
      t.fn();
    }
  }
}

{
  setTvGuestBusy(false, nowMs);
  setTvGuestBusy(true, nowMs);
  check("guest busy blocks immediately", !isTvReloadIdle(nowMs));
  check(
    "guest busy allows after max defer",
    isTvReloadIdle(nowMs + TV_GUEST_BUSY_MAX_DEFER_MS + 1)
  );
}

{
  Object.keys(store).forEach((k) => delete store[k]);
  timers.clear();
  seq = 0;
  nowMs = 1_000_000;
  document.hidden = false;
  setTvGuestBusy(true, nowMs);

  let reloads = 0;
  const stop = createTvWakeRecovery({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    setIntervalImpl: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { fn, ms, last: nowMs });
      return id;
    },
    clearIntervalImpl: (id) => timers.delete(id),
    reloadImpl: async () => {
      reloads += 1;
      return true;
    },
    selfHealImpl: () => () => {},
  });

  fireTimers(TV_WAKE_FREEZE_GAP_MS + TV_WAKE_HEARTBEAT_MS);
  check("freeze reload bypasses guest-busy gate", reloads === 1);
  stop();
  setTvGuestBusy(false, nowMs);
}

process.exit(failed);
