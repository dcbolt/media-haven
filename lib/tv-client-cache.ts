import { DEFAULT_AMBIENCE } from "./ambience";
import {
  LAST_GOOD_TTL_MS,
  scrubGuestPrivacyFromState,
} from "./tv-last-good-policy";
import type { TvContent, TvState } from "./tv";

export const LAST_GOOD_KEY = "fh_tv_last_good";
export { LAST_GOOD_TTL_MS, scrubGuestPrivacyFromState } from "./tv-last-good-policy";

type LastGoodEnvelope = {
  savedAt: string;
  state: TvState;
};

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

function parseEnvelope(raw: string): LastGoodEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as LastGoodEnvelope | TvState;
    if (parsed && typeof parsed === "object" && "savedAt" in parsed && "state" in parsed) {
      return parsed as LastGoodEnvelope;
    }
    if (parsed && (parsed as TvState).mode) {
      return { savedAt: new Date(0).toISOString(), state: parsed as TvState };
    }
  } catch {
    /* corrupt */
  }
  return null;
}

export function readLastGoodState(nowMs: number = Date.now()): TvState | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(LAST_GOOD_KEY);
    if (!cached) return null;
    const envelope = parseEnvelope(cached);
    if (!envelope) return null;
    if (nowMs - new Date(envelope.savedAt).getTime() > LAST_GOOD_TTL_MS) {
      localStorage.removeItem(LAST_GOOD_KEY);
      return null;
    }
    const state = envelope.state;
    if (state && (state.mode === "demo" || state.mode === "active")) {
      return scrubGuestPrivacyFromState(normalizeState(state), nowMs);
    }
  } catch {
    /* corrupt cache */
  }
  return null;
}

export function writeLastGoodState(state: TvState): void {
  if (typeof window === "undefined") return;
  if (state.mode !== "demo" && state.mode !== "active") return;
  const envelope: LastGoodEnvelope = {
    savedAt: new Date().toISOString(),
    state: scrubGuestPrivacyFromState(state),
  };
  try {
    localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(envelope));
  } catch {
    /* best-effort */
  }
}
