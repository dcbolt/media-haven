/** Guest-engaged / playback-busy gate before budgeted self-reload (ROADMAP 1.7). */

export const TV_GUEST_BUSY_ATTR = "data-tv-guest-busy";

export function setTvGuestBusy(busy: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (busy) root.setAttribute(TV_GUEST_BUSY_ATTR, "true");
  else root.removeAttribute(TV_GUEST_BUSY_ATTR);
}

/** True when a budgeted reload is allowed (no guest task in progress). */
export function isTvReloadIdle(): boolean {
  if (typeof document === "undefined") return true;
  return !document.documentElement.hasAttribute(TV_GUEST_BUSY_ATTR);
}
