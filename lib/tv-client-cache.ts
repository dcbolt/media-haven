import { DEFAULT_AMBIENCE } from "./ambience";
import type { TvContent, TvState } from "./tv";

export const LAST_GOOD_KEY = "fh_tv_last_good";

/** Older deployments cached a narrower TvContent. Fill missing arrays so stale
 *  JSON never crashes the renderer. */
export function normalizeState(s: TvState): TvState {
  if (s.mode !== "demo" && s.mode !== "active") return s;
  const c = s.content as Partial<TvContent>;
  return {
    ...s,
    content: {
      ...s.content,
      sections: c.sections ?? [],
      photos: c.photos ?? [],
      screensavers: c.screensavers ?? [],
      guestLabel: c.guestLabel ?? c.guestFirstName ?? null,
      checkIn: c.checkIn ?? null,
      forecast: c.forecast ?? null,
      timing: c.timing ?? { slideMs: 20_000, fadeMs: 2_500 },
      ambience: c.ambience ?? DEFAULT_AMBIENCE,
      nextYear: c.nextYear ?? null,
      showTurtles: c.showTurtles ?? true,
      upsell: c.upsell ?? null,
      playlist: c.playlist ?? null,
      takeover: c.takeover ?? null,
      vacantPlaylist: c.vacantPlaylist ?? null,
    },
  };
}

export function readLastGoodState(): TvState | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(LAST_GOOD_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as TvState;
    if (parsed && (parsed.mode === "demo" || parsed.mode === "active")) {
      return normalizeState(parsed);
    }
  } catch {
    /* corrupt cache */
  }
  return null;
}

export function writeLastGoodState(state: TvState): void {
  if (typeof window === "undefined") return;
  if (state.mode !== "demo" && state.mode !== "active") return;
  try {
    localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}
