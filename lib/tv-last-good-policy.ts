import type { TvState } from "./tv";

/** Drop cached signage payload after this — stale guest names must not linger. */
export const LAST_GOOD_TTL_MS = 48 * 60 * 60 * 1000;

/** After checkout, strip guest-identifying fields from cached signage (F-887). */
export function scrubGuestPrivacyFromState(
  state: TvState,
  nowMs: number = Date.now()
): TvState {
  if (state.mode !== "demo" && state.mode !== "active") return state;
  const co = state.content.checkOut;
  if (!co || new Date(co).getTime() > nowMs) return state;
  return {
    ...state,
    content: {
      ...state.content,
      occupied: false,
      guestFirstName: null,
      guestLabel: null,
    },
  };
}
