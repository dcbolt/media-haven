/**
 * Behaviour smokes — periodic 4–6 h + nightly ~4 AM ET + coordination (F-2134–F-2136).
 */
import {
  TV_SELF_HEAL_JITTER_MS,
  TV_SELF_HEAL_MIN_MS,
  msUntilPeriodicSelfHeal,
} from "../lib/tv-self-heal-interval.ts";
import {
  TV_NIGHTLY_DEFER_AFTER_RELOAD_MS,
  nightlyProbeBackoffMs,
  shouldDeferNightlyAfterRecentReload,
} from "../lib/tv-self-heal-coordination.ts";
import { msUntilNightlySelfHeal } from "../lib/tv-self-heal-schedule.ts";
import { wallClockInTimeZoneToUtcMs } from "../lib/tv-timezone.ts";
import { TV_NIGHTLY_RELOAD_TZ } from "../lib/tv-nightly-reload.ts";
import {
  TV_WAKE_RELOADS_PER_HOUR,
  canAttemptWakeReload,
  recordWakeReload,
} from "../lib/tv-wake-reload-cap.ts";
import {
  createTvCombinedSelfHeal,
  createTvNightlySelfHeal,
  createTvPeriodicSelfHeal,
} from "../lib/tv-wake-recovery.ts";
import { setTvGuestBusy, isTvReloadIdle } from "../lib/tv-reload-idle.ts";
import { attemptBudgetedSelfReload } from "../lib/tv-budgeted-self-reload.ts";

const realSetTimeout = globalThis.setTimeout.bind(globalThis);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

async function flushAsync() {
  await new Promise((r) => realSetTimeout(r, 60));
}

async function waitForTimer(timers, tries = 8) {
  for (let i = 0; i < tries && timers.size === 0; i++) {
    await flushAsync();
  }
}

// --- coordination pure functions ---
check(
  "nightly defers after reload within 1h",
  shouldDeferNightlyAfterRecentReload([Date.now() - 30 * 60_000], Date.now())
);
check(
  "nightly not deferred after 2h",
  !shouldDeferNightlyAfterRecentReload(
    [Date.now() - 2 * 3600_000],
    Date.now()
  )
);

check("probe backoff base is 60s", nightlyProbeBackoffMs(1) === 60_000);
check("probe backoff caps at 30m", nightlyProbeBackoffMs(99) === 30 * 60_000);
check(
  "mutation: zero backoff base would spin (guarded)",
  nightlyProbeBackoffMs(1) > 0
);

const elevenAmEt = wallClockInTimeZoneToUtcMs(
  "2026-10-24",
  TV_NIGHTLY_RELOAD_TZ,
  11,
  0,
  0
);
const untilNight = msUntilNightlySelfHeal(elevenAmEt, () => 0);
check(
  "11 AM ET waits for next night (no same-day 5 PM catch-up)",
  untilNight > 12 * 3600_000
);

// --- 3/hour cap ---
{
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
  const times = [];
  const t0 = 1_000_000;
  for (let i = 0; i < TV_WAKE_RELOADS_PER_HOUR; i++) {
    times.push(t0 + i * 1000);
    recordWakeReload(sessionStorage, t0 + i * 1000);
  }
  check(
    "fourth budgeted reload blocked by 3/hour cap",
    !canAttemptWakeReload(times, t0 + 4000)
  );
}

// --- timer-driven periodic + nightly ---
{
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
  globalThis.localStorage = globalThis.sessionStorage;

  let nowMs = 0;
  const timers = new Map();
  let seq = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, at: nowMs + ms });
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  function fireDue() {
    for (const [id, t] of [...timers.entries()]) {
      if (t.at <= nowMs) {
        timers.delete(id);
        t.fn();
      }
    }
  }
  function advance(ms) {
    nowMs += ms;
    fireDue();
  }

  globalThis.document = {
    hidden: false,
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
  globalThis.window = { sessionStorage, localStorage: sessionStorage };

  check(
    "periodic delay in 4–6h band",
    msUntilPeriodicSelfHeal(nowMs, () => 0) >= TV_SELF_HEAL_MIN_MS
  );

  let reloads = 0;
  const stopP = createTvPeriodicSelfHeal({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    periodicDelayOverride: () => 5,
    reloadImpl: async () => {
      reloads += 1;
      return true;
    },
  });
  await waitForTimer(timers);
  advance(10);
  await flushAsync();
  await flushAsync();
  check("(a) periodic 4–6h path fires reload", reloads === 1);
  stopP();
}

{
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
  globalThis.localStorage = globalThis.sessionStorage;

  let nowMs = wallClockInTimeZoneToUtcMs(
    "2026-10-24",
    TV_NIGHTLY_RELOAD_TZ,
    4,
    10,
    0
  );
  const timers = new Map();
  let seq = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, at: nowMs + ms });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  function advance(ms) {
    nowMs += ms;
    for (const [id, t] of [...timers.entries()]) {
      if (t.at <= nowMs) {
        timers.delete(id);
        t.fn();
      }
    }
  }

  globalThis.document = {
    hidden: false,
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
  globalThis.window = { sessionStorage, localStorage: sessionStorage };

  nowMs = wallClockInTimeZoneToUtcMs(
    "2026-10-24",
    TV_NIGHTLY_RELOAD_TZ,
    4,
    5,
    0
  );

  let reloads = 0;
  const stopN = createTvNightlySelfHeal({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    nightlyDelayOverride: () => 5,
    reloadImpl: async () => {
      reloads += 1;
      return true;
    },
  });
  await waitForTimer(timers);
  advance(10);
  await flushAsync();
  await flushAsync();
  check("(b) nightly ~4 AM path fires reload", reloads === 1);
  stopN();
}

{
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
  globalThis.localStorage = globalThis.sessionStorage;

  let nowMs = wallClockInTimeZoneToUtcMs(
    "2026-10-24",
    TV_NIGHTLY_RELOAD_TZ,
    4,
    10,
    0
  );
  recordWakeReload(
    sessionStorage,
    wallClockInTimeZoneToUtcMs("2026-10-24", TV_NIGHTLY_RELOAD_TZ, 3, 45, 0)
  );

  const timers = new Map();
  let seq = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, at: nowMs + ms });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  function advance(ms) {
    nowMs += ms;
    for (const [id, t] of [...timers.entries()]) {
      if (t.at <= nowMs) {
        timers.delete(id);
        t.fn();
      }
    }
  }

  globalThis.document = {
    hidden: false,
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
  globalThis.window = { sessionStorage, localStorage: sessionStorage };

  let reloads = 0;
  const stop = createTvNightlySelfHeal({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    nightlyDelayOverride: () => 5,
    reloadImpl: async () => {
      reloads += 1;
      return true;
    },
  });
  await flushAsync();

  advance(10);
  await flushAsync();
  check(
    "(c) nightly skipped when periodic reload within last ~1h",
    reloads === 0
  );
  stop();
}

{
  globalThis.document = {
    hidden: false,
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
  setTvGuestBusy(false);
  check("idle by default", isTvReloadIdle());
  setTvGuestBusy(true);
  check("(d) guest busy blocks idle gate", !isTvReloadIdle());
  setTvGuestBusy(false);

  let nowMs = 0;
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
  globalThis.localStorage = sessionStorage;
  const timers = new Map();
  let seq = 0;
  globalThis.setTimeout = (fn, ms) => {
    const id = ++seq;
    timers.set(id, { fn, at: nowMs + ms });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  function advance(ms) {
    nowMs += ms;
    for (const [id, t] of [...timers.entries()]) {
      if (t.at <= nowMs) {
        timers.delete(id);
        t.fn();
      }
    }
  }
  globalThis.window = { sessionStorage, localStorage: sessionStorage };

  setTvGuestBusy(true);
  let reloads = 0;
  const stop = createTvPeriodicSelfHeal({
    deviceId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    previewProperty: null,
    isOffline: () => false,
    now: () => nowMs,
    periodicDelayOverride: () => 5,
    reloadImpl: async () => {
      reloads += 1;
      return true;
    },
  });
  await flushAsync();
  advance(10);
  await flushAsync();
  check("(d) periodic blocked while guest busy", reloads === 0);
  stop();
  setTvGuestBusy(false);
}

check(
  "mutation: bypass 3/h cap would allow extra reload",
  !canAttemptWakeReload(
    [1, 2, 3].map((i) => 1000 * i),
    5000
  )
);

void TV_NIGHTLY_DEFER_AFTER_RELOAD_MS;
void attemptBudgetedSelfReload;

process.exit(failed);
