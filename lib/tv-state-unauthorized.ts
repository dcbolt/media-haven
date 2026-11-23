import { DEFAULT_AMBIENCE } from "./ambience.ts";
import type { TvContent, TvState } from "./tv";

/** Fail-closed 401: brand shell only — no property, guest, tiles, or guide payload (MH186-7). */
export function minimalUnauthorizedTvState(): Extract<TvState, { mode: "active" }> {
  const content: TvContent = {
    propertyName: "Florida Havens",
    occupied: false,
    wifiSsid: null,
    wifiPassword: null,
    wifiQr: null,
    sections: [],
    guestFirstName: null,
    guestLabel: null,
    checkIn: null,
    checkOut: null,
    weather: null,
    sun: null,
    forecast: null,
    tides: null,
    launches: null,
    screensavers: [],
    heroPhoto: null,
    photos: [],
    logoUrl: null,
    deviceLabel: null,
    streaming: [],
    portalQr: null,
    bookUrl: "https://www.thefloridahavens.com",
    bookQr: "",
    timing: { slideMs: 20_000, fadeMs: 2_500 },
    ambience: DEFAULT_AMBIENCE,
    showTurtles: false,
    nextYear: null,
    extendStay: null,
    guestBook: null,
    upsell: null,
    playlist: null,
    takeover: null,
    vacantPlaylist: null,
  };
  return { mode: "active", content };
}

export function unauthorizedBodyIsBrandingOnly(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as { mode?: string; content?: Partial<TvContent> };
  if (o.mode !== "active" || !o.content) return false;
  const c = o.content;
  return (
    (c.sections?.length ?? 0) === 0 &&
    (c.photos?.length ?? 0) === 0 &&
    (c.screensavers?.length ?? 0) === 0 &&
    (c.streaming?.length ?? 0) === 0 &&
    !c.deviceLabel &&
    !c.wifiPassword &&
    !c.portalQr &&
    !c.guestFirstName
  );
}