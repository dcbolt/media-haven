/**
 * Shared probed reload for wake freeze + periodic self-heal (cap + debounce).
 */

import {
  TV_WAKE_RELOAD_DEBOUNCE_MS,
  readWakeReloadTimestamp,
  wakeReloadDebounced,
  writeWakeReloadTimestamp,
} from "./tv-wake-freeze.ts";
import {
  canAttemptWakeReload,
  readWakeReloadLog,
  recordWakeReload,
} from "./tv-wake-reload-cap.ts";

export type BudgetedSelfReloadAttempt = {
  deviceId: string | null;
  previewProperty: string | null;
  now: number;
  storage: Storage | null;
  isOffline: () => boolean;
  reload: (
    deviceId: string | null,
    previewProperty: string | null
  ) => Promise<boolean>;
};

/** @returns true when reload was started. */
export async function attemptBudgetedSelfReload(
  opts: BudgetedSelfReloadAttempt
): Promise<boolean> {
  if (opts.isOffline()) return false;
  const lastAttempt = readWakeReloadTimestamp(opts.storage);
  if (!wakeReloadDebounced(lastAttempt, opts.now, TV_WAKE_RELOAD_DEBOUNCE_MS)) {
    return false;
  }
  const log = readWakeReloadLog(opts.storage);
  if (!canAttemptWakeReload(log, opts.now)) return false;

  writeWakeReloadTimestamp(opts.storage, opts.now);
  const reloaded = await opts.reload(opts.deviceId, opts.previewProperty);
  if (reloaded) {
    recordWakeReload(opts.storage, opts.now);
  }
  return reloaded;
}
