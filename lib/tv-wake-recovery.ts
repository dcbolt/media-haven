/**
 * UniFi / signage WebView recovery: detect main-thread freeze (heartbeat gap)
 * and wake-from-sleep, then probed reload — never blind-reload while offline.
 */

import { reloadTvIfReachable } from "./tv-reload";
import {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  heartbeatGapIndicatesFreeze,
} from "./tv-wake-freeze";

export {
  TV_WAKE_FREEZE_GAP_MS,
  TV_WAKE_HEARTBEAT_MS,
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  heartbeatGapIndicatesFreeze,
} from "./tv-wake-freeze";

export type TvWakeRecoveryOptions = {
  deviceId: string | null;
  previewProperty: string | null;
  isOffline: () => boolean;
  /** Host preview / pinned slide — no poll or wake reload loops. */
  disabled?: boolean;
  now?: () => number;
};

export function createTvWakeRecovery(opts: TvWakeRecoveryOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  if (opts.disabled) return () => {};

  const now = opts.now ?? (() => Date.now());
  let lastBeat = now();
  let lastReloadAttempt = 0;
  let disposed = false;

  const attemptWakeReload = (reason: string) => {
    if (disposed) return;
    if (opts.isOffline()) return;
    const t = now();
    if (t - lastReloadAttempt < TV_WAKE_RELOAD_DEBOUNCE_MS) return;
    lastReloadAttempt = t;
    void reloadTvIfReachable(opts.deviceId, opts.previewProperty, {
      kind: "budgeted",
    }).catch(() => {
      /* probe failed — stay on last-good / offline strip */
    });
    void reason;
  };

  const onHeartbeat = () => {
    const t = now();
    if (heartbeatGapIndicatesFreeze(lastBeat, t)) {
      attemptWakeReload("heartbeat-freeze");
    }
    lastBeat = t;
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      attemptWakeReload("visibility");
    }
  };

  const onPageShow = (ev: PageTransitionEvent) => {
    if (ev.persisted) attemptWakeReload("pageshow");
  };

  const onResume = () => {
    attemptWakeReload("resume");
  };

  const heartbeat = window.setInterval(onHeartbeat, TV_WAKE_HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("resume", onResume);

  return () => {
    disposed = true;
    window.clearInterval(heartbeat);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("resume", onResume);
  };
}
