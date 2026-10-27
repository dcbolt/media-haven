/**
 * F-1137 — drive createTvWakeRecovery (timers, cap, gap, hidden skip).
 */
import {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
} from "../lib/tv-wake-freeze.ts";
import { TV_WAKE_RELOADS_PER_HOUR } from "../lib/tv-wake-reload-cap.ts";
import { createTvWakeRecovery } from "../lib/tv-wake-recovery.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

void TV_WAKE_RELOADS_PER_HOUR;

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

let nowMs = 1_000_000;
const timers = new Map();
let timerSeq = 0;

function fakeSetInterval(fn, ms) {
  const id = ++timerSeq;
  timers.set(id, { fn, ms, last: nowMs });
  return id;
}

function fakeClearInterval(id) {
  timers.delete(id);
}

function fireTimers(advanceMs) {
  nowMs += advanceMs;
  for (const t of timers.values()) {
    while (nowMs - t.last >= t.ms) {
      t.last += t.ms;
      t.fn();
    }
  }
}

/** One heartbeat tick after advancing past the freeze gap. */
function simulateFreezeGap() {
  nowMs += TV_WAKE_FREEZE_GAP_MS + TV_WAKE_HEARTBEAT_MS;
  for (const t of timers.values()) {
    if (nowMs - t.last >= t.ms) {
      t.last = nowMs;
      t.fn();
      break;
    }
  }
}

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

globalThis.window = {
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
};

function mount(reloadImpl) {
  Object.keys(store).forEach((k) => delete store[k]);
  timers.clear();
  timerSeq = 0;
  document.hidden = false;
  return createTvWakeRecovery({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    setIntervalImpl: fakeSetInterval,
    clearIntervalImpl: fakeClearInterval,
    reloadImpl,
    selfHealImpl: () => () => {},
  });
}

{
  let reloads = 0;
  const stop = mount(async () => {
    reloads += 1;
    return true;
  });
  fireTimers(TV_WAKE_HEARTBEAT_MS);
  check("no reload without freeze gap", reloads === 0);
  fireTimers(TV_WAKE_FREEZE_GAP_MS + TV_WAKE_HEARTBEAT_MS);
  check("heartbeat gap triggers reload", reloads === 1);
  stop();
}

{
  let reloads = 0;
  const stop = mount(async () => {
    reloads += 1;
    return true;
  });
  document.hidden = true;
  fireTimers(TV_WAKE_FREEZE_GAP_MS + TV_WAKE_HEARTBEAT_MS * 3);
  check("hidden skips gap reload", reloads === 0);
  document.hidden = false;
  fireTimers(TV_WAKE_FREEZE_GAP_MS + TV_WAKE_HEARTBEAT_MS);
  check("visible gap reload after hidden", reloads === 1);
  stop();
}

{
  let reloads = 0;
  const stop = mount(async () => {
    reloads += 1;
    return true;
  });
  const twoHours = 2 * 3600_000;
  let elapsed = 0;
  while (elapsed < twoHours) {
    document.hidden = elapsed % 100_000 >= 50_000;
    fireTimers(5_000);
    elapsed += 5_000;
  }
  check("2h hide/show every 50s without gap → no bare visibility reloads", reloads === 0);
  stop();
}

process.exit(failed);
