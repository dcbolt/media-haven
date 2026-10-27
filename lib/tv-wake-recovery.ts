/**
 * UniFi / signage WebView recovery: heartbeat freeze gap → probed reload.
 * Visibility wake reloads removed — gap only (F-1136).
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
// TV_WAKE_MIN_HIDDEN_MS retained in freeze for docs only

export {
  TV_WAKE_RELOAD_LOG_KEY,
  TV_WAKE_RELOADS_PER_HOUR,
  canAttemptWakeReload,
  readWakeReloadLog,
  recordWakeReload,
} from "./tv-wake-reload-cap.ts";

export { msUntilNightlySelfHeal } from "./tv-self-heal-schedule.ts";
export { msUntilPeriodicSelfHeal } from "./tv-self-heal-interval.ts";
export { attemptBudgetedSelfReload } from "./tv-budgeted-self-reload.ts";

const NIGHTLY_RETRY_MS = 5 * 60_000;

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
  /** @internal smoke — nightly self-heal timer */
  selfHealImpl?: (opts: TvWakeRecoveryOptions) => () => void;
};

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
  const reloadFnBudgeted =
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
    });
  const reloadFnExempt = async (
    deviceId: string | null,
    previewProperty: string | null
  ) => {
    const { reloadTvIfReachable } = await import("./tv-reload.ts");
    return reloadTvIfReachable(deviceId, previewProperty, { kind: "exempt" });
  };

  const attemptFreezeReload = () => {
    if (disposed) return;
    if (!isTvReloadIdle()) return;
    void attemptBudgetedSelfReload({
      deviceId: opts.deviceId,
      previewProperty: opts.previewProperty,
      now: now(),
      storage,
      isOffline: opts.isOffline,
      reload: reloadFnExempt,
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

  const stopSelfHeal = (opts.selfHealImpl ?? createTvNightlySelfHeal)(opts);

  return () => {
    disposed = true;
    clearIntervalFn(heartbeat);
    stopSelfHeal();
  };
}

/** ~4 AM America/New_York probed reload — shares wake + session reload caps (ROADMAP 1.7). */
export function createTvNightlySelfHeal(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (opts.disabled) return () => {};

  const storage = sessionStorageSafe();
  const local = localStorageSafe();
  const now = opts.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const reloadFn =
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
    });

  const schedule = async (delayMs?: number) => {
    if (disposed) return;
    const { msUntilNightlySelfHeal } = await import("./tv-self-heal-schedule.ts");
    const delay = delayMs ?? msUntilNightlySelfHeal(now());
    timer = setTimeout(() => void attemptNightly(), delay);
  };

  const attemptNightly = async () => {
    if (disposed) return;
    const t = now();
    if (!shouldAttemptNightlyReload(t, local)) {
      void schedule();
      return;
    }
    if (opts.isOffline() || !isTvReloadIdle()) {
      void schedule(NIGHTLY_RETRY_MS);
      return;
    }

    const reloaded = await attemptBudgetedSelfReload({
      deviceId: opts.deviceId,
      previewProperty: opts.previewProperty,
      now: t,
      storage,
      isOffline: opts.isOffline,
      reload: reloadFn,
    });
    if (reloaded) {
      markNightlyReloadAttempted(t, local);
    } else {
      void schedule(NIGHTLY_RETRY_MS);
      return;
    }
    void schedule();
  };

  void schedule();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
  };
}

/** @deprecated ROADMAP 1.7 — use createTvNightlySelfHeal. Kept for tests referencing interval math. */
export function createTvPeriodicSelfHeal(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined") return () => {};
  if (opts.disabled) return () => {};

  const storage = sessionStorageSafe();
  const now = opts.now ?? (() => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const reloadFn =
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
    });

  const schedule = async () => {
    if (disposed) return;
    const { msUntilPeriodicSelfHeal } = await import("./tv-self-heal-interval.ts");
    const delay = msUntilPeriodicSelfHeal(now());
    timer = setTimeout(async () => {
      if (disposed) return;
      if (!isTvReloadIdle()) {
        void schedule();
        return;
      }
      await attemptBudgetedSelfReload({
        deviceId: opts.deviceId,
        previewProperty: opts.previewProperty,
        now: now(),
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
    if (timer) clearTimeout(timer);
  };
}
