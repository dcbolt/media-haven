/**
 * UniFi / signage WebView recovery: heartbeat freeze gap → probed reload.
 * Periodic 4–6 h + nightly ~4 AM ET self-heal (ROADMAP 1.7 / F-2134).
 */

import { attemptBudgetedSelfReload } from "./tv-budgeted-self-reload.ts";
import {
  TV_WAKE_HEARTBEAT_MS,
  wakeHeartbeatReloadAllowed,
} from "./tv-wake-freeze.ts";
import {
  markNightlyReloadAttempted,
  shouldAttemptNightlyReload,
} from "./tv-nightly-reload.ts";
import { isTvReloadIdle } from "./tv-reload-idle.ts";
import {
  nightlyProbeBackoffMs,
  shouldDeferNightlyAfterRecentReload,
} from "./tv-self-heal-coordination.ts";
import { readWakeReloadLog } from "./tv-wake-reload-cap.ts";
import {
  isInNightlyReloadWindow,
  nightlyInWindowRetryDelayMs,
} from "./tv-self-heal-schedule.ts";

export {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  TV_WAKE_LAST_RELOAD_STORAGE_KEY,
  heartbeatGapIndicatesFreeze,
  readWakeReloadTimestamp,
  wakeHeartbeatReloadAllowed,
  wakeReloadDebounced,
  writeWakeReloadTimestamp,
} from "./tv-wake-freeze.ts";

export {
  TV_WAKE_RELOAD_LOG_KEY,
  TV_WAKE_RELOADS_PER_HOUR,
  canAttemptWakeReload,
  readWakeReloadLog,
  recordWakeReload,
} from "./tv-wake-reload-cap.ts";

export {
  isInNightlyReloadWindow,
  msUntilNightlySelfHeal,
  msUntilNightlyWindowEnd,
} from "./tv-self-heal-schedule.ts";
export { msUntilPeriodicSelfHeal } from "./tv-self-heal-interval.ts";
export { attemptBudgetedSelfReload } from "./tv-budgeted-self-reload.ts";
export {
  nightlyProbeBackoffMs,
  shouldDeferNightlyAfterRecentReload,
  TV_NIGHTLY_DEFER_AFTER_RELOAD_MS,
} from "./tv-self-heal-coordination.ts";

const NIGHTLY_IDLE_RETRY_MS = 5 * 60_000;

function sessionStorageSafe(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function localStorageSafe(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export type TvWakeRecoveryOptions = {
  deviceId: string | null;
  previewProperty: string | null;
  isOffline: () => boolean;
  disabled?: boolean;
  now?: () => number;
  reloadImpl?: (
    deviceId: string | null,
    previewProperty: string | null
  ) => Promise<boolean>;
  setIntervalImpl?: (fn: () => void, ms: number) => number;
  clearIntervalImpl?: (id: number) => void;
  /** @internal smoke — replaces periodic + nightly timers */
  selfHealImpl?: (opts: TvWakeRecoveryOptions) => () => void;
  /** @internal smoke — override periodic delay (ms) */
  periodicDelayOverride?: (nowMs: number) => number;
  /** @internal smoke — override nightly schedule delay (ms) */
  nightlyDelayOverride?: (nowMs: number) => number;
};

function defaultReloadBudgeted(
  opts: TvWakeRecoveryOptions
): (deviceId: string | null, previewProperty: string | null) => Promise<boolean> {
  return (
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
    })
  );
}

async function defaultReloadExempt(
  deviceId: string | null,
  previewProperty: string | null
): Promise<boolean> {
  const { reloadTvIfReachable } = await import("./tv-reload.ts");
  return reloadTvIfReachable(deviceId, previewProperty, { kind: "exempt" });
}

export function createTvCombinedSelfHeal(opts: TvWakeRecoveryOptions): () => void {
  const stopPeriodic = createTvPeriodicSelfHeal(opts);
  const stopNightly = createTvNightlySelfHeal(opts);
  return () => {
    stopPeriodic();
    stopNightly();
  };
}

export function createTvWakeRecovery(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (opts.disabled) return () => {};

  const now = opts.now ?? (() => Date.now());
  const storage = sessionStorageSafe();
  let lastBeat = now();
  let disposed = false;

  const setIntervalFn = opts.setIntervalImpl ?? window.setInterval.bind(window);
  const clearIntervalFn = opts.clearIntervalImpl ?? window.clearInterval.bind(window);
  const reloadForFreeze = opts.reloadImpl ?? defaultReloadExempt;
  const reloadBudgeted = defaultReloadBudgeted(opts);

  const attemptFreezeReload = () => {
    if (disposed) return;
    void attemptBudgetedSelfReload({
      deviceId: opts.deviceId,
      previewProperty: opts.previewProperty,
      now: now(),
      storage,
      isOffline: opts.isOffline,
      reload: reloadForFreeze,
    });
  };

  const onHeartbeat = () => {
    const t = now();
    if (wakeHeartbeatReloadAllowed(lastBeat, t, document.hidden)) {
      attemptFreezeReload();
    }
    if (!document.hidden) {
      lastBeat = t;
    }
  };

  const heartbeat = setIntervalFn(onHeartbeat, TV_WAKE_HEARTBEAT_MS);

  const stopSelfHeal = (opts.selfHealImpl ?? createTvCombinedSelfHeal)(opts);

  return () => {
    disposed = true;
    clearIntervalFn(heartbeat);
    stopSelfHeal();
  };
}

/** Jittered 4–6 h probed reload (#167). Shares wake cap + guest-idle gate. */
export function createTvPeriodicSelfHeal(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (opts.disabled) return () => {};

  const storage = sessionStorageSafe();
  const now = opts.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const reloadFn = defaultReloadBudgeted(opts);

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = async () => {
    if (disposed) return;
    const { msUntilPeriodicSelfHeal } = await import("./tv-self-heal-interval.ts");
    const delay =
      opts.periodicDelayOverride?.(now()) ?? msUntilPeriodicSelfHeal(now());
    clearTimer();
    timer = setTimeout(async () => {
      if (disposed) return;
      const t = now();
      if (opts.isOffline() || !isTvReloadIdle(t)) {
        clearTimer();
        timer = setTimeout(() => void schedule(), NIGHTLY_IDLE_RETRY_MS);
        return;
      }
      clearTimer();
      await attemptBudgetedSelfReload({
        deviceId: opts.deviceId,
        previewProperty: opts.previewProperty,
        now: t,
        storage,
        isOffline: opts.isOffline,
        reload: reloadFn,
      });
      void schedule();
    }, delay);
  };

  void schedule();

  return () => {
    disposed = true;
    clearTimer();
  };
}

/** ~4 AM America/New_York probed reload — addition to periodic (#167 + F-2134). */
export function createTvNightlySelfHeal(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (opts.disabled) return () => {};

  const storage = sessionStorageSafe();
  const local = localStorageSafe();
  const now = opts.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let probeFailAttempts = 0;
  const reloadFn = defaultReloadBudgeted(opts);

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = async (delayMs?: number) => {
    if (disposed) return;
    const { msUntilNightlySelfHeal } = await import("./tv-self-heal-schedule.ts");
    const delay =
      delayMs ??
      opts.nightlyDelayOverride?.(now()) ??
      msUntilNightlySelfHeal(now());
    clearTimer();
    timer = setTimeout(() => void attemptNightly(), delay);
  };

  const scheduleAfterProbeFailure = (t: number) => {
    probeFailAttempts += 1;
    const backoff = nightlyProbeBackoffMs(probeFailAttempts);
    const inWindow = nightlyInWindowRetryDelayMs(t, backoff);
    if (inWindow !== null) {
      void schedule(inWindow);
    } else {
      void schedule();
    }
  };

  const attemptNightly = async () => {
    if (disposed) return;
    clearTimer();
    const t = now();
    if (!isInNightlyReloadWindow(t)) {
      void schedule();
      return;
    }
    if (!shouldAttemptNightlyReload(t, local)) {
      void schedule();
      return;
    }
    if (opts.isOffline()) {
      scheduleAfterProbeFailure(t);
      return;
    }
    if (!isTvReloadIdle(t)) {
      void schedule(NIGHTLY_IDLE_RETRY_MS);
      return;
    }

    const log = readWakeReloadLog(storage);
    if (shouldDeferNightlyAfterRecentReload(log, t)) {
      markNightlyReloadAttempted(t, local);
      void schedule();
      return;
    }

    const reloadWithNightlyMark = async (
      deviceId: string | null,
      previewProperty: string | null
    ) => {
      markNightlyReloadAttempted(t, local);
      return reloadFn(deviceId, previewProperty);
    };

    const reloaded = await attemptBudgetedSelfReload({
      deviceId: opts.deviceId,
      previewProperty: opts.previewProperty,
      now: t,
      storage,
      isOffline: opts.isOffline,
      reload: reloadWithNightlyMark,
    });
    if (!reloaded) {
      scheduleAfterProbeFailure(t);
      return;
    }
    probeFailAttempts = 0;
    void schedule();
  };

  void schedule();

  return () => {
    disposed = true;
    clearTimer();
  };
}
