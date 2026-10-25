/**
 * UniFi / signage WebView recovery: heartbeat freeze gap → probed reload.
 * Visibility wake reloads removed — gap only (F-1136).
 */

import { attemptBudgetedSelfReload } from "./tv-budgeted-self-reload.ts";
import {
  TV_WAKE_HEARTBEAT_MS,
  readWakeReloadTimestamp,
  wakeHeartbeatReloadAllowed,
  writeWakeReloadTimestamp,
} from "./tv-wake-freeze.ts";

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

export { msUntilPeriodicSelfHeal } from "./tv-self-heal-interval.ts";
export { attemptBudgetedSelfReload } from "./tv-budgeted-self-reload.ts";

function sessionStorageSafe(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
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
  /** @internal smoke — periodic self-heal timer */
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
  const reloadFn =
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "exempt" });
    });

  const attemptFreezeReload = () => {
    if (disposed) return;
    void attemptBudgetedSelfReload({
      deviceId: opts.deviceId,
      previewProperty: opts.previewProperty,
      now: now(),
      storage,
      isOffline: opts.isOffline,
      reload: reloadFn,
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

  const stopSelfHeal = (opts.selfHealImpl ?? createTvPeriodicSelfHeal)(opts);

  return () => {
    disposed = true;
    clearIntervalFn(heartbeat);
    stopSelfHeal();
  };
}

/** Jittered 4–6 h probed reload (supersedes #158 nightly cron wiring). */
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
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "exempt" });
    });

  const schedule = async () => {
    if (disposed) return;
    const { msUntilPeriodicSelfHeal } = await import("./tv-self-heal-interval.ts");
    const delay = msUntilPeriodicSelfHeal(now());
    timer = setTimeout(async () => {
      if (disposed) return;
      await attemptBudgetedSelfReload({
        deviceId: opts.deviceId,
        previewProperty: opts.previewProperty,
        now: now(),
        storage,
        isOffline: opts.isOffline,
        reload: reloadFn,
      });
      schedule();
    }, delay);
  };

  void schedule();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
  };
}
