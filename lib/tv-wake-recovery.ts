/**
 * UniFi / signage WebView recovery: detect main-thread freeze (heartbeat gap)
 * and wake-from-sleep, then probed reload — never blind-reload while offline.
 */

import {
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_MIN_HIDDEN_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  readWakeReloadTimestamp,
  wakeHeartbeatReloadAllowed,
  wakeReloadDebounced,
  wakeSurfaceReloadAllowed,
  writeWakeReloadTimestamp,
} from "./tv-wake-freeze.ts";

export {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_MIN_HIDDEN_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  TV_WAKE_LAST_RELOAD_STORAGE_KEY,
  heartbeatGapIndicatesFreeze,
  readWakeReloadTimestamp,
  wakeHeartbeatReloadAllowed,
  wakeReloadDebounced,
  wakeSurfaceReloadAllowed,
  writeWakeReloadTimestamp,
} from "./tv-wake-freeze.ts";

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
  /** Host preview / pinned slide — no poll or wake reload loops. */
  disabled?: boolean;
  now?: () => number;
  /** @internal smoke — record reload attempts without navigation. */
  reloadImpl?: (
    deviceId: string | null,
    previewProperty: string | null
  ) => Promise<boolean>;
  /** @internal smoke — inject timer implementation. */
  setIntervalImpl?: (fn: () => void, ms: number) => number;
  clearIntervalImpl?: (id: number) => void;
};

export function createTvWakeRecovery(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (opts.disabled) return () => {};

  const now = opts.now ?? (() => Date.now());
  const storage = sessionStorageSafe();
  let lastBeat = now();
  let lastReloadAttempt = readWakeReloadTimestamp(storage);
  let hiddenSince: number | null = document.hidden ? now() : null;
  let disposed = false;

  const setIntervalFn = opts.setIntervalImpl ?? window.setInterval.bind(window);
  const clearIntervalFn = opts.clearIntervalImpl ?? window.clearInterval.bind(window);
  const reloadFn =
    opts.reloadImpl ??
    (async (deviceId, previewProperty) => {
      const { reloadTvIfReachable } = await import("./tv-reload.ts");
      return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
    });

  const attemptWakeReload = (reason: string) => {
    if (disposed) return;
    if (opts.isOffline()) return;
    const t = now();
    if (!wakeReloadDebounced(lastReloadAttempt, t, TV_WAKE_RELOAD_DEBOUNCE_MS)) {
      return;
    }
    lastReloadAttempt = t;
    writeWakeReloadTimestamp(storage, t);
    void reloadFn(opts.deviceId, opts.previewProperty).catch(() => {
      /* probe failed — stay on last-good / offline strip */
    });
    void reason;
  };

  const onHeartbeat = () => {
    const t = now();
    if (wakeHeartbeatReloadAllowed(lastBeat, t, document.hidden)) {
      attemptWakeReload("heartbeat-freeze");
    }
    if (!document.hidden) {
      lastBeat = t;
    }
  };

  const onVisibility = () => {
    const t = now();
    if (document.visibilityState === "hidden") {
      hiddenSince ??= t;
      return;
    }
    if (
      wakeSurfaceReloadAllowed(lastBeat, t, hiddenSince, undefined, TV_WAKE_MIN_HIDDEN_MS)
    ) {
      attemptWakeReload("visibility");
    }
    hiddenSince = null;
    lastBeat = t;
  };

  const onPageShow = (ev: PageTransitionEvent) => {
    if (!ev.persisted) return;
    const t = now();
    if (
      wakeSurfaceReloadAllowed(lastBeat, t, hiddenSince, undefined, TV_WAKE_MIN_HIDDEN_MS)
    ) {
      attemptWakeReload("pageshow");
    }
    hiddenSince = null;
    lastBeat = t;
  };

  const onResume = () => {
    const t = now();
    if (
      wakeSurfaceReloadAllowed(lastBeat, t, hiddenSince, undefined, TV_WAKE_MIN_HIDDEN_MS)
    ) {
      attemptWakeReload("resume");
    }
    hiddenSince = null;
    lastBeat = t;
  };

  const heartbeat = setIntervalFn(onHeartbeat, TV_WAKE_HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("resume", onResume);

  return () => {
    disposed = true;
    clearIntervalFn(heartbeat);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("resume", onResume);
  };
}
