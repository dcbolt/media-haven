/** Guest-engaged gate before budgeted self-reload (ROADMAP 1.7). */

export const TV_GUEST_BUSY_ATTR = "data-tv-guest-busy";
export const TV_GUEST_BUSY_SINCE_KEY = "fh_tv_guest_busy_since";
/** After this long guest-busy, allow budgeted reload at next check (still 3/h cap). */
export const TV_GUEST_BUSY_MAX_DEFER_MS = 2 * 3600_000;

function htmlRoot(): {
  setAttribute(n: string, v: string): void;
  removeAttribute(n: string): void;
  hasAttribute(n: string): boolean;
} | null {
  if (typeof document === "undefined") return null;
  const el = document.documentElement as
    | {
        setAttribute?(n: string, v: string): void;
        removeAttribute?(n: string): void;
        hasAttribute?(n: string): boolean;
      }
    | null
    | undefined;
  if (!el || typeof el.hasAttribute !== "function") return null;
  return el as {
    setAttribute(n: string, v: string): void;
    removeAttribute(n: string): void;
    hasAttribute(n: string): boolean;
  };
}

function sessionStorageSafe(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function readGuestBusySinceMs(): number | null {
  const ss = sessionStorageSafe();
  if (!ss) return null;
  try {
    const n = Number(ss.getItem(TV_GUEST_BUSY_SINCE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setTvGuestBusy(busy: boolean, nowMs = Date.now()): void {
  const root = htmlRoot();
  const ss = sessionStorageSafe();
  if (busy) {
    root?.setAttribute(TV_GUEST_BUSY_ATTR, "true");
    try {
      ss?.setItem(TV_GUEST_BUSY_SINCE_KEY, String(nowMs));
    } catch {
      /* private mode */
    }
  } else {
    root?.removeAttribute(TV_GUEST_BUSY_ATTR);
    try {
      ss?.removeItem(TV_GUEST_BUSY_SINCE_KEY);
    } catch {
      /* private mode */
    }
  }
}

/** Budgeted reload allowed (guest idle, or guest-busy deferral exceeded). */
export function isTvReloadIdle(nowMs = Date.now()): boolean {
  const root = htmlRoot();
  if (!root?.hasAttribute(TV_GUEST_BUSY_ATTR)) return true;
  const since = readGuestBusySinceMs();
  if (since === null) return false;
  return nowMs - since >= TV_GUEST_BUSY_MAX_DEFER_MS;
}

export function guestBusyDeferRemainingMs(
  nowMs: number,
  maxDeferMs = TV_GUEST_BUSY_MAX_DEFER_MS
): number {
  const since = readGuestBusySinceMs();
  if (since === null) return 0;
  return Math.max(0, maxDeferMs - (nowMs - since));
}
