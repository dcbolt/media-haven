/**
 * F-1137 — drive createTvWakeRecovery with fake timers + visibility.
 */
import {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_MIN_HIDDEN_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  TV_WAKE_LAST_RELOAD_STORAGE_KEY,
  writeWakeReloadTimestamp,
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
    if (nowMs - t.last >= t.ms) {
      t.last = nowMs;
      t.fn();
    }
  }
}

const visListeners = new Map();
globalThis.document = {
  hidden: false,
  visibilityState: "visible",
  addEventListener(type, fn) {
    if (type === "visibilitychange") visListeners.set("visibilitychange", fn);
    if (type === "resume") visListeners.set("resume", fn);
  },
  removeEventListener() {},
};

globalThis.window = {
  sessionStorage: globalThis.sessionStorage,
  addEventListener(type, fn) {
    if (type === "pageshow") visListeners.set("pageshow", fn);
  },
  removeEventListener() {},
};

function setVisible() {
  document.hidden = false;
  document.visibilityState = "visible";
}

function setHidden() {
  document.hidden = true;
  document.visibilityState = "hidden";
}

function emitVisibility() {
  visListeners.get("visibilitychange")?.();
}

function mountWakeRecovery(reloadImpl, opts = {}) {
  if (!opts.keepWakeDebounce) {
    delete store[TV_WAKE_LAST_RELOAD_STORAGE_KEY];
  }
  timers.clear();
  timerSeq = 0;
  visListeners.clear();
  setVisible();
  return createTvWakeRecovery({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    setIntervalImpl: fakeSetInterval,
    clearIntervalImpl: fakeClearInterval,
    reloadImpl,
  });
}

{
  let reloads = 0;
  const stop = mountWakeRecovery(async () => {
    reloads += 1;
    return false;
  });

  fireTimers(TV_WAKE_HEARTBEAT_MS);
  check("short heartbeat tick does not reload", reloads === 0);

  setHidden();
  emitVisibility();
  nowMs += 2_000;
  fireTimers(TV_WAKE_HEARTBEAT_MS);
  check("gap reload skipped while hidden", reloads === 0);

  setVisible();
  emitVisibility();
  check("visibility after brief hide does not reload", reloads === 0);

  setHidden();
  emitVisibility();
  nowMs += TV_WAKE_MIN_HIDDEN_MS + 1;
  setVisible();
  emitVisibility();
  check("visibility after min hidden triggers reload", reloads === 1);
  stop();
}

{
  let reloads = 0;
  nowMs = 2_000_000;
  writeWakeReloadTimestamp(sessionStorage, nowMs - 5_000);
  const stop = mountWakeRecovery(
    async () => {
      reloads += 1;
      return false;
    },
    { keepWakeDebounce: true }
  );

  setHidden();
  emitVisibility();
  nowMs += TV_WAKE_MIN_HIDDEN_MS + 1;
  setVisible();
  emitVisibility();
  check(
    "sessionStorage wake debounce survives (no second reload)",
    reloads === 0
  );
  stop();
}

{
  let reloads = 0;
  nowMs = 3_000_000;
  writeWakeReloadTimestamp(
    sessionStorage,
    nowMs - TV_WAKE_RELOAD_DEBOUNCE_MS - 1
  );
  const stop = mountWakeRecovery(async () => {
    reloads += 1;
    return false;
  });
  setHidden();
  emitVisibility();
  nowMs += TV_WAKE_MIN_HIDDEN_MS + 1;
  setVisible();
  emitVisibility();
  check("wake reload allowed after debounce window", reloads === 1);
  stop();
}

process.exit(failed);
