import QRCode from "qrcode";
import { bookingUrlFor, bookingUrlForDates } from "./booking";
import { ACTIVE_STAY_STATUSES, isRangeAvailable } from "./guesty";
import {
  DEMO_PROPERTY_NAME,
  DEMO_SECTIONS,
  legacySections,
  signageName,
  type GuideSection,
} from "./content";
import {
  fetchUpcomingLaunches,
  sampleLaunches,
  type UpcomingLaunch,
} from "./launches";
import { logoFor } from "./logos";
import { loadSections } from "./reservations";
import { listScreensavers, type ScreensaverAsset } from "./screensavers";
import { appLaunchUrl, enabledServices } from "./streaming";
import { ensureGuestToken, portalBaseUrl } from "./tokens";
import { supabaseAdmin } from "./supabase";
import { upsellFor } from "./upsell";
import { fetchTides, sampleTides, type TideEvent } from "./tides";
import {
  fetchForecast,
  fetchWeather,
  MELBOURNE_BEACH,
  type ForecastDay,
} from "./weather";
import {
  claimPendingCommand,
  type PendingCommand,
} from "./tv-commands";
import {
  loadEmergencyTakeover,
  type EmergencyTakeover,
} from "./takeover";
import { loadCampaigns, pickActiveCampaign } from "./campaigns";
import {
  isMediaCurrentlyValid,
  loadMediaMeta,
  type MediaMetaMap,
} from "./media-meta";
import { getDeviceReloadAt } from "./fleet-reload";

/**
 * TV signage backend. A TV loads /tv in its browser, invents a device id,
 * and polls for state. Until a host claims the device to a property it shows
 * a pairing code; after that it gets the property's signage content, plus
 * the current guest's name when a reservation is in-house.
 *
 * Without Supabase configured everything runs in demo mode so a TV can be
 * pointed at the deployed URL before any setup exists.
 */

export type TvState =
  | {
      mode: "demo";
      content: TvContent;
      pendingCommand?: PendingCommand | null;
      /** S0.3b: host force-reload stamp (ISO); client reloads once. */
      forceReloadAt?: string | null;
    }
  | {
      mode: "pairing";
      pairCode: string;
      pendingCommand?: PendingCommand | null;
      forceReloadAt?: string | null;
    }
  | {
      mode: "active";
      content: TvContent;
      pendingCommand?: PendingCommand | null;
      forceReloadAt?: string | null;
    };

export interface TvContent {
  propertyName: string;
  /** False when the property has no in-house reservation — the TV shows a
   *  black standby screen instead of signage (nobody's there to read it). */
  occupied: boolean;
  wifiSsid: string | null;
  wifiPassword: string | null;
  wifiQr: string | null; // data URL; scanning joins the network directly
  sections: GuideSection[];
  guestFirstName: string | null;
  /** Formal lockup for the persistent header — "The Wambolts" when we know
   *  the family name, the first name otherwise. */
  guestLabel: string | null;
  checkIn: string | null;
  checkOut: string | null;
  weather: { tempF: number; label: string } | null;
  sun: { sunrise: string; sunset: string } | null;
  /** Daily outlook for the Weather section's 3-day / 5-day slides. */
  forecast: ForecastDay[] | null;
  tides: TideEvent[] | null;
  launches: UpcomingLaunch[] | null;
  screensavers: ScreensaverAsset[];
  /** Property hero shot (welcome-slide background) and the full photo set
   *  from the Guesty media sweep (ambient slides + standby slideshow). */
  heroPhoto: string | null;
  photos: string[];
  /** Per-property brand mark (white-on-transparent). */
  logoUrl: string | null;
  /** Human-friendly TV name for the casting panel ("Living Room"). */
  deviceLabel: string | null;
  /** Streaming services advertised on the Entertainment page (CMS-toggled).
   *  activateQr encodes the service's own activation URL so a selected
   *  service can present its sign-in path instantly. */
  streaming: {
    name: string;
    activateLabel: string;
    color: string;
    activateQr: string | null;
    /** Android intent URI — selecting the tile launches the native app on
     *  this same device (no Home press, no input change). */
    appUrl: string;
  }[];
  /** QR to the current guest's phone portal (one-tap sign-in links) —
   *  the least-annoying path into a TV app: scan once, tap the service,
   *  type the code. Null when the property is unoccupied. */
  portalQr: string | null;
  /** Direct-booking site QR — the rebooking pitch on the last slide. */
  bookUrl: string;
  bookQr: string;
  /** Host-tunable rotation pacing (CMS → settings.signage). Slides rest
   *  slideMs before advancing; transitions are smooth fades over fadeMs. */
  timing: { slideMs: number; fadeMs: number };
  /** Sea-turtle awareness slide (season-aware, client-rendered) — CMS feed
   *  toggle settings.feeds.turtles, default on. */
  showTurtles: boolean;
  /** "These exact dates next year" rebook pitch — present ONLY when the
   *  same dates one year out are verified available on the Guesty calendar.
   *  The QR pre-loads those dates into the booking engine. */
  nextYear: {
    checkIn: string;
    checkOut: string;
    url: string;
    qr: string;
  } | null;
  /** Cross-property upsell pitch, chosen by which unit this TV lives in
   *  (Beach Street → the Dunes villas; a Dunes villa → the whole property;
   *  whole-Dunes → four-Havens awareness). QR lands on direct booking. */
  upsell: {
    eyebrow: string;
    headline: string;
    body: string;
    url: string;
    qr: string;
    qrLabel: string;
  } | null;
  /** Host-arranged rotation from the signage editor (settings.playlist):
   *  ordered blocks with optional per-slide seconds, plus whether ambient
   *  property photos interleave. Null = the default rotation. Event slides
   *  (farewell, launch-today) always join regardless. */
  playlist: {
    items: {
      key: string;
      seconds?: number;
      transition?: string;
      /** Day-part gate — the block only rotates during this window
       *  (absent = all day). Still reachable from the menu any time. */
      daypart?: string;
      /** Media block (signage editor library): a full-bleed image/video
       *  slide sourced from the Drive/Blob media pool. */
      url?: string;
      mediaType?: "image" | "video";
    }[];
    photos: boolean;
  } | null;
  /**
   * S1.3b fleet emergency takeover (storm / water / custom). When set and
   * not past `until`, the TV shows only this full-bleed message.
   */
  takeover: EmergencyTakeover | null;
  /**
   * S1.4 vacant-mode playlist (between stays). Media from this pack plays
   * on standby before falling back to ambient screensavers/photos.
   * Null = no custom vacant rotation.
   */
  vacantPlaylist: SignagePlaylist | null;
}

/** Per-block entrance animations the TV knows how to run. */
export const SLIDE_TRANSITIONS = ["fade", "glide", "zoom", "none"] as const;

/** Day-part windows (device-local time): morning 5–11, afternoon 12–16,
 *  evening 17 through the night. */
export const SLIDE_DAYPARTS = ["morning", "afternoon", "evening"] as const;

export type SignagePlaylist = NonNullable<TvContent["playlist"]>;

/** Sanitize settings.playlist (host-authored JSON). Bad shapes become null
 *  (default rotation) — a broken playlist must never blank a TV. */
export function signagePlaylist(raw: unknown): SignagePlaylist | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { items?: unknown; photos?: unknown };
  if (!Array.isArray(o.items)) return null;
  const seen = new Set<string>();
  const items: SignagePlaylist["items"] = [];
  for (const it of o.items.slice(0, 40)) {
    if (!it || typeof it !== "object") continue;
    const key = String((it as { key?: unknown }).key ?? "")
      .trim()
      .slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const s = Number((it as { seconds?: unknown }).seconds);
    const t = String((it as { transition?: unknown }).transition ?? "");
    const item: SignagePlaylist["items"][number] = { key };
    if (Number.isFinite(s) && s > 0)
      item.seconds = Math.min(120, Math.max(5, Math.round(s)));
    // "fade" is the default — only non-default transitions are stored.
    if ((SLIDE_TRANSITIONS as readonly string[]).includes(t) && t !== "fade")
      item.transition = t;
    const d = String((it as { daypart?: unknown }).daypart ?? "");
    if ((SLIDE_DAYPARTS as readonly string[]).includes(d)) item.daypart = d;
    // Media blocks carry their own source; https-only, length-capped.
    const url = String((it as { url?: unknown }).url ?? "");
    const mt = String((it as { mediaType?: unknown }).mediaType ?? "");
    if (
      /^https:\/\/\S{5,600}$/.test(url) &&
      (mt === "image" || mt === "video")
    ) {
      item.url = url;
      item.mediaType = mt;
    }
    items.push(item);
  }
  if (items.length === 0) return null;
  return { items, photos: o.photos !== false };
}

/**
 * Guest-mode playlist with S1.1 campaign override.
 * Precedence for what the TV rotates when occupied:
 *   emergency takeover (handled separately on content.takeover)
 *   > active calendar campaign (org settings)
 *   > property settings.playlist
 *   > default built-in rotation (null playlist)
 */
export async function resolveGuestPlaylist(
  propertyId: string,
  propertyPlaylistRaw: unknown
): Promise<SignagePlaylist | null> {
  const campaigns = await loadCampaigns();
  const active = pickActiveCampaign(campaigns, propertyId);
  const pl = active ? active.playlist : signagePlaylist(propertyPlaylistRaw);
  return filterValidPlaylistMedia(pl, await loadMediaMeta());
}

/**
 * S1.2 media validity on the ROTATION, not just the editor pool: media
 * blocks whose org mediaMeta says expired or not-yet-started are dropped
 * server-side, so holiday media can be scheduled ahead and retires itself.
 * Non-media blocks always pass. If filtering empties the playlist the TV
 * falls back to the default rotation (null) — never a blank screen.
 */
export function filterValidPlaylistMedia(
  pl: SignagePlaylist | null,
  meta: MediaMetaMap,
  now = Date.now()
): SignagePlaylist | null {
  if (!pl) return null;
  const items = pl.items.filter(
    (it) => !it.url || isMediaCurrentlyValid(meta[it.url], now)
  );
  if (items.length === 0) return null;
  if (items.length === pl.items.length) return pl;
  return { ...pl, items };
}

export type PlaylistHistoryEntry = { at: string; playlist: unknown };

/** Sanitize settings.playlistHistory (S0.4 publish safety) — newest
 *  first, capped at 10, entries must still pass the playlist sanitizer. */
export function playlistHistory(raw: unknown): PlaylistHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is PlaylistHistoryEntry =>
        Boolean(e) &&
        typeof e === "object" &&
        typeof (e as PlaylistHistoryEntry).at === "string" &&
        signagePlaylist((e as PlaylistHistoryEntry).playlist) !== null
    )
    .slice(0, 10);
}

/** Same stay, one year out (YYYY-MM-DD). */
function plusOneYear(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Availability answers change slowly; don't hit Guesty's calendar API on
// every 10s TV poll. Per-instance, keyed by reservation.
const nextYearMemo = new Map<
  string,
  { at: number; value: TvContent["nextYear"] }
>();

async function nextYearRebook(
  reservationId: string,
  checkIn: string,
  checkOut: string,
  guestyId: string | null
): Promise<TvContent["nextYear"]> {
  if (!guestyId) return null;
  const hit = nextYearMemo.get(reservationId);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.value;
  const from = plusOneYear(checkIn);
  const to = plusOneYear(checkOut);
  // Only a confirmed "available" earns the on-screen promise.
  const available = await isRangeAvailable(guestyId, from, to);
  const value =
    available === true
      ? {
          checkIn: from,
          checkOut: to,
          url: bookingUrlForDates(guestyId, from, to),
          qr: await bookDirectQr(bookingUrlForDates(guestyId, from, to)),
        }
      : null;
  nextYearMemo.set(reservationId, { at: Date.now(), value });
  return value;
}

/** Clamp host-entered pacing to sane signage bounds; defaults: 20s rest,
 *  slow 2.5s fade. */
export function signageTiming(
  signage: { slideSeconds?: number; fadeSeconds?: number } | undefined | null
): TvContent["timing"] {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  const slide = Number(signage?.slideSeconds);
  const fade = Number(signage?.fadeSeconds);
  return {
    slideMs: Number.isFinite(slide) && slide > 0 ? clamp(slide, 5, 120) * 1000 : 20_000,
    fadeMs: Number.isFinite(fade) && fade > 0 ? clamp(fade, 0.2, 8) * 1000 : 2_500,
  };
}

/** Formal family treatment for signage: "Robert Adelson" → "The Adelsons",
 *  "Devin Wambolt" → "The Wambolts". Sibilant endings take -es (Jones →
 *  The Joneses). Without a surname we fall back to the first name rather
 *  than guess at formality. */
export function familyLabel(
  firstName: string | null,
  lastName: string | null
): string | null {
  const last = lastName?.trim();
  if (!last) return firstName;
  const plural = /(s|x|z|ch|sh)$/i.test(last) ? `${last}es` : `${last}s`;
  return `The ${plural}`;
}

async function bookDirectQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#12333f", light: "#ffffff" },
  });
}

/** Streaming entries for TvContent, each with a QR to its activation page. */
async function streamingContent(
  streaming: Record<string, boolean> | null | undefined
): Promise<TvContent["streaming"]> {
  return Promise.all(
    enabledServices(streaming).map(async (s) => ({
      name: s.name,
      activateLabel: s.activateLabel,
      color: s.color,
      activateQr: await portalQrFor(s.activateUrl),
      appUrl: appLaunchUrl(s.androidPackage),
    }))
  );
}

/** QR to the guest's own portal (one-tap activation links). Best-effort —
 *  the Entertainment panel simply omits it when there's no live token. */
async function portalQrFor(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#12333f", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

// No 0/O/1/I/L — hosts read these codes off a TV across the room.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generatePairCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function wifiJoinQr(ssid: string, password: string): Promise<string> {
  const escape = (v: string) => v.replace(/([\\;,:"])/g, "\\$1");
  return QRCode.toDataURL(`WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;`, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#12333f", light: "#ffffff" },
  });
}

/** Hard time budget for a decoration source. The individual fetches carry
 *  AbortSignal timeouts, but those can be swallowed (e.g. by the framework's
 *  data-cache sharing an in-flight fetch) — this cap is external, so the TV
 *  state endpoint can never hang on a wedged upstream. Falls back and logs
 *  which source blew the budget. */
export function within<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => {
      console.warn(`tv-state: ${label} exceeded ${ms}ms budget — using fallback`);
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      }
    );
  });
}

const SOURCE_BUDGET_MS = 8000;

/** Pitch + direct-booking QR for the cross-property upsell slide. */
async function upsellContent(
  propertyName: string
): Promise<TvContent["upsell"]> {
  const pitch = upsellFor(propertyName);
  const url = bookingUrlFor(pitch.guestyId);
  return {
    eyebrow: pitch.eyebrow,
    headline: pitch.headline,
    body: pitch.body,
    url,
    qr: await bookDirectQr(url),
    qrLabel: pitch.qrLabel,
  };
}

async function demoContent(): Promise<TvContent> {
  // Local/dev photo stand-ins (prod demo mode simply shows no photo slides).
  const demoPhotos = (process.env.DEMO_PHOTO_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const [{ weather, sun }, forecast, launches, tides, screensavers] =
    await Promise.all([
      within(
        fetchWeather(MELBOURNE_BEACH.lat, MELBOURNE_BEACH.lon),
        SOURCE_BUDGET_MS,
        { weather: null, sun: null },
        "weather"
      ),
      within(
        fetchForecast(MELBOURNE_BEACH.lat, MELBOURNE_BEACH.lon),
        SOURCE_BUDGET_MS,
        null,
        "forecast"
      ),
      within(fetchUpcomingLaunches(), SOURCE_BUDGET_MS, null, "launches"),
      within(fetchTides(), SOURCE_BUDGET_MS, null, "tides"),
      within(listScreensavers(null), SOURCE_BUDGET_MS, [], "screensavers"),
    ]);
  return {
    propertyName: DEMO_PROPERTY_NAME,
    occupied: true,
    wifiSsid: "TheDunes-Guest",
    wifiPassword: "SeaTurtle2026!",
    wifiQr: await wifiJoinQr("TheDunes-Guest", "SeaTurtle2026!"),
    sections: DEMO_SECTIONS.filter((s) => s.showOnTv),
    guestFirstName: "Alex",
    guestLabel: familyLabel("Alex", "Rivera"),
    checkIn: new Date(Date.now() - 86400_000).toISOString(),
    checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
    weather,
    sun: sun ?? {
      sunrise: `${new Date().toISOString().slice(0, 10)}T06:32`,
      sunset: `${new Date().toISOString().slice(0, 10)}T20:19`,
    },
    forecast,
    tides: tides ?? sampleTides(),
    launches: launches ?? sampleLaunches(),
    screensavers,
    heroPhoto: demoPhotos[0] ?? null,
    photos: demoPhotos,
    logoUrl: process.env.DEMO_LOGO_URL ?? logoFor(DEMO_PROPERTY_NAME),
    deviceLabel: null,
    streaming: await streamingContent(null),
    portalQr: await portalQrFor(`${portalBaseUrl()}/welcome?token=demo`),
    bookUrl: bookingUrlFor(null),
    bookQr: await bookDirectQr(bookingUrlFor(null)),
    timing: signageTiming(null),
    showTurtles: true,
    upsell: await upsellContent(DEMO_PROPERTY_NAME),
    playlist: null,
    takeover: await loadEmergencyTakeover(),
    vacantPlaylist: null,
    // Demo shows the strong pitch so the farewell preview is representative.
    nextYear: {
      checkIn: plusOneYear(new Date(Date.now() - 86400_000).toISOString()),
      checkOut: plusOneYear(new Date(Date.now() + 3 * 86400_000).toISOString()),
      url: bookingUrlFor(null),
      qr: await bookDirectQr(bookingUrlFor(null)),
    },
  };
}

export async function registerTvDevice(deviceId: string): Promise<TvState> {
  const db = supabaseAdmin();
  if (!db) return { mode: "demo", content: await demoContent() };

  const { data: existing } = await db
    .from("tv_devices")
    .select("pair_code")
    .eq("id", deviceId)
    .maybeSingle();
  if (existing) return { mode: "pairing", pairCode: existing.pair_code };

  for (let attempt = 0; attempt < 5; attempt++) {
    const pairCode = generatePairCode();
    const { error } = await db
      .from("tv_devices")
      .insert({ id: deviceId, pair_code: pairCode });
    if (!error) return { mode: "pairing", pairCode };
  }
  throw new Error("could not allocate a pairing code");
}

export async function getTvState(deviceId: string): Promise<TvState> {
  const db = supabaseAdmin();
  if (!db) return { mode: "demo", content: await demoContent() };

  const { data: device } = await db
    .from("tv_devices")
    .select("pair_code, property_id, label")
    .eq("id", deviceId)
    .maybeSingle();

  // S0.3b: host reload stamp (org settings) — works in pairing too.
  const forceReloadAt = await getDeviceReloadAt(deviceId);

  if (!device) {
    const reg = await registerTvDevice(deviceId);
    return { ...reg, forceReloadAt };
  }
  await db
    .from("tv_devices")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", deviceId);

  if (!device.property_id) {
    return { mode: "pairing", pairCode: device.pair_code, forceReloadAt };
  }

  // J1 joined stays: while "The Havens at the Dunes"/"at Beach Street" is
  // rented, member TVs serve the joined listing's signage — but keep this
  // house's own Wi-Fi (each building has its own network). Failure-safe:
  // resolveJoinedOverride returns null on any error and the TV falls back
  // to its own property.
  const { resolveJoinedOverride } = await import("./joined-stays");
  const joined = await resolveJoinedOverride(device.property_id);
  const state = joined
    ? (await propertyTvState(joined.group.joinedPropertyId, device.label ?? null, {
        wifiFromPropertyId: device.property_id,
      })) ?? (await propertyTvState(device.property_id, device.label ?? null))
    : await propertyTvState(device.property_id, device.label ?? null);
  if (!state) {
    return { mode: "pairing", pairCode: device.pair_code, forceReloadAt };
  }

  // Path C: claim at most one pending launch command for this device.
  const pendingCommand = await claimPendingCommand({
    propertyId: device.property_id,
    deviceId,
  });
  return { ...state, pendingCommand, forceReloadAt };
}

/** The active-signage state a TV paired to this property would show.
 *  Shared by paired devices and the host preview/thumbnail path (which
 *  passes a propertyId directly — no device rows touched). Null when the
 *  property is missing or the DB isn't configured. */
export async function propertyTvState(
  propertyId: string,
  deviceLabel: string | null,
  opts?: {
    /** J1: serve this property's Wi-Fi instead of propertyId's own — used
     *  when a joined stay points a member TV at the joined listing but the
     *  guest still joins the member house's network. */
    wifiFromPropertyId?: string;
  }
): Promise<Extract<TvState, { mode: "active" }> | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  interface PropertyContentRow {
    name: string;
    guesty_id: string | null;
    hero_image_url: string | null;
    photos: unknown;
    logo_url: string | null;
    wifi_ssid: string | null;
    wifi_password: string | null;
    house_rules: string | null;
    local_guide: string | null;
    emergency_info: string | null;
    latitude: number | null;
    longitude: number | null;
    settings?: {
      displayName?: string | null;
      feeds?: Record<string, boolean>;
      streaming?: Record<string, boolean>;
      signage?: { slideSeconds?: number; fadeSeconds?: number };
      playlist?: unknown;
      vacantPlaylist?: unknown;
    } | null;
  }
  const PROPERTY_COLUMNS =
    "name, guesty_id, hero_image_url, photos, logo_url, wifi_ssid, wifi_password, house_rules, local_guide, emergency_info, latitude, longitude";
  // settings arrives with migration 0011; fall back gracefully until it runs.
  let property = (
    await db
      .from("properties")
      .select(`${PROPERTY_COLUMNS}, settings`)
      .eq("id", propertyId)
      .maybeSingle()
  ).data as PropertyContentRow | null;
  if (!property) {
    property = (
      await db
        .from("properties")
        .select(PROPERTY_COLUMNS)
        .eq("id", propertyId)
        .maybeSingle()
    ).data as PropertyContentRow | null;
  }
  if (!property) return null;

  if (opts?.wifiFromPropertyId && opts.wifiFromPropertyId !== propertyId) {
    const { data: wifiRow } = await db
      .from("properties")
      .select("wifi_ssid, wifi_password")
      .eq("id", opts.wifiFromPropertyId)
      .maybeSingle();
    if (wifiRow) {
      property = {
        ...property,
        wifi_ssid: wifiRow.wifi_ssid ?? null,
        wifi_password: wifiRow.wifi_password ?? null,
      };
    }
  }

  // CMS feed toggles (settings.feeds.<name>: false disables the feed/slide).
  const feeds = property.settings?.feeds ?? {};
  const feedOn = (k: string) => feeds[k] !== false;

  interface CurrentStayRow {
    id: string;
    guest_first_name: string | null;
    guest_last_name?: string | null;
    guest_label_override?: string | null;
    check_in: string;
    check_out: string;
  }
  const now = new Date().toISOString();
  const stayQuery = (columns: string) =>
    db
      .from("reservations")
      .select(columns)
      .eq("property_id", propertyId)
      .in("status", ACTIVE_STAY_STATUSES)
      .lte("check_in", now)
      .gte("check_out", now)
      .order("check_in", { ascending: false })
      .limit(1)
      .maybeSingle();
  // guest_last_name / guest_label_override arrive with migrations 0014 and
  // 0016; retry without them until both have run.
  let { data: current, error: stayError } = (await stayQuery(
    "id, guest_first_name, guest_last_name, guest_label_override, check_in, check_out"
  )) as { data: CurrentStayRow | null; error: unknown };
  if (stayError) {
    current = (await stayQuery("id, guest_first_name, check_in, check_out"))
      .data as CurrentStayRow | null;
  }

  // S5.4 mode transition hooks — edge-only channel apply (dynamic import
  // avoids mode-hooks ↔ tv circular load). If a playlist was rewritten,
  // re-read property settings so this poll serves the new rotation.
  {
    const { maybeApplyModeHooks } = await import("./mode-hooks");
    const settingsBag =
      property.settings && typeof property.settings === "object"
        ? (property.settings as Record<string, unknown>)
        : {};
    const hookResult = await maybeApplyModeHooks({
      propertyId,
      occupied: Boolean(current),
      stayId: current?.id ?? null,
      propertySettings: settingsBag,
    });
    if (hookResult.applied) {
      const { data: refreshed } = await db
        .from("properties")
        .select("settings")
        .eq("id", propertyId)
        .maybeSingle();
      if (refreshed?.settings && typeof refreshed.settings === "object") {
        property = {
          ...property,
          settings: refreshed.settings as PropertyContentRow["settings"],
        };
      }
    }
  }

  // Guest's own portal link for the Entertainment panel QR — reuses the
  // stay's live token (mints one if the stay somehow has none).
  const guestPortal = current
    ? await within(
        ensureGuestToken(current.id, current.check_out),
        SOURCE_BUDGET_MS,
        null,
        "guest-token"
      )
    : null;

  let sections = await loadSections(propertyId);
  if (sections.length === 0) sections = legacySections(property);
  const photos: string[] = Array.isArray(property.photos)
    ? (property.photos as string[]).filter((u) => typeof u === "string")
    : [];

  // Forecast reuses the property's coordinates, falling back to Melbourne
  // Beach — all six Havens are on the same barrier island, so the default
  // is accurate, not just graceful.
  const weatherLat = property.latitude ?? MELBOURNE_BEACH.lat;
  const weatherLon = property.longitude ?? MELBOURNE_BEACH.lon;
  const [launches, tides, screensavers, weatherSun, forecast] =
    await Promise.all([
      feedOn("launches")
        ? within(fetchUpcomingLaunches(), SOURCE_BUDGET_MS, null, "launches")
        : Promise.resolve(null),
      feedOn("tides")
        ? within(fetchTides(), SOURCE_BUDGET_MS, null, "tides")
        : Promise.resolve(null),
      within(listScreensavers(propertyId), SOURCE_BUDGET_MS, [], "screensavers"),
      within(
        feedOn("weather") && property.latitude != null && property.longitude != null
          ? fetchWeather(property.latitude, property.longitude)
          : Promise.resolve({ weather: null, sun: null }),
        SOURCE_BUDGET_MS,
        { weather: null, sun: null },
        "weather"
      ),
      feedOn("weather")
        ? within(
            fetchForecast(weatherLat, weatherLon),
            SOURCE_BUDGET_MS,
            null,
            "forecast"
          )
        : Promise.resolve(null),
    ]);

  return {
    mode: "active",
    content: {
      propertyName: signageName(property.name, property.settings?.displayName),
      occupied: Boolean(current),
      wifiSsid: property.wifi_ssid,
      wifiPassword: property.wifi_password,
      wifiQr:
        property.wifi_ssid && property.wifi_password
          ? await wifiJoinQr(property.wifi_ssid, property.wifi_password)
          : null,
      sections: sections.filter((s) => s.showOnTv),
      guestFirstName: current?.guest_first_name ?? null,
      guestLabel: current
        ? (current.guest_label_override?.trim() ||
          familyLabel(current.guest_first_name, current.guest_last_name ?? null))
        : null,
      checkIn: current?.check_in ?? null,
      checkOut: current?.check_out ?? null,
      weather: weatherSun.weather,
      sun: weatherSun.sun,
      forecast,
      tides,
      launches,
      // Property photos join the standby slideshow after uploaded media.
      screensavers: [
        ...screensavers,
        ...photos
          .filter((url) => !screensavers.some((a) => a.url === url))
          .map((url) => ({ url, type: "image" as const })),
      ],
      heroPhoto: property.hero_image_url ?? photos[0] ?? null,
      photos,
      logoUrl: property.logo_url ?? logoFor(property.name),
      deviceLabel,
      streaming: await streamingContent(property.settings?.streaming),
      portalQr: await portalQrFor(guestPortal?.url ?? null),
      bookUrl: bookingUrlFor(property.guesty_id),
      bookQr: await bookDirectQr(bookingUrlFor(property.guesty_id)),
      timing: signageTiming(property.settings?.signage),
      showTurtles: feedOn("turtles"),
      upsell: await upsellContent(property.name),
      // Content precedence on the TV (S1.1):
      //   emergency takeover > active calendar campaign > settings.playlist > default
      // Campaigns are org-scoped date windows; they override the property
      // playlist without rewriting it (publish history stays clean).
      playlist: await resolveGuestPlaylist(
        propertyId,
        property.settings?.playlist
      ),
      takeover: await loadEmergencyTakeover(),
      vacantPlaylist: filterValidPlaylistMedia(
        signagePlaylist(property.settings?.vacantPlaylist),
        await loadMediaMeta()
      ),
      nextYear: current
        ? await within(
            nextYearRebook(
              current.id,
              current.check_in,
              current.check_out,
              property.guesty_id
            ),
            SOURCE_BUDGET_MS,
            null,
            "next-year"
          )
        : null,
    },
  };
}

export interface TvDeviceRow {
  id: string;
  label: string | null;
  pair_code: string;
  property_id: string | null;
  property_name: string | null;
  claimed_at: string | null;
  last_seen: string;
  /** S0.1 fleet: property has an in-house reservation right now. Null if unlinked. */
  occupied: boolean | null;
  /** Short guest lockup when occupied (for fleet map). */
  guest_label: string | null;
  /**
   * J2: active joined-stay group covering this TV's property (member house
   * serving the joined listing). Null when unlinked or no live join.
   */
  joined_name: string | null;
  /** Joined listing property id (for now-playing / links). */
  joined_property_id: string | null;
}

export async function listTvDevices(): Promise<TvDeviceRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];

  // label arrives with migration 0007; fall back gracefully until it runs.
  let { data, error } = await db
    .from("tv_devices")
    .select("id, label, pair_code, property_id, claimed_at, last_seen, properties (name)")
    .order("last_seen", { ascending: false });
  if (error) {
    const retry = await db
      .from("tv_devices")
      .select("id, pair_code, property_id, claimed_at, last_seen, properties (name)")
      .order("last_seen", { ascending: false });
    data = (retry.data ?? []).map((d) => ({ ...d, label: null }));
  }

  const rows = data ?? [];
  const propertyIds = [
    ...new Set(
      rows
        .map((d) => d.property_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  // Occupancy map: property_id → guest label when an active stay is in-house.
  const occupiedByProperty = new Map<string, string | null>();
  if (propertyIds.length > 0) {
    const now = new Date().toISOString();
    const stayCols =
      "property_id, guest_first_name, guest_last_name, guest_label_override";
    let stays = (
      await db
        .from("reservations")
        .select(stayCols)
        .in("property_id", propertyIds)
        .in("status", ACTIVE_STAY_STATUSES)
        .lte("check_in", now)
        .gte("check_out", now)
    ).data;
    if (!stays) {
      // Pre-migration columns: first name only.
      const retry = await db
        .from("reservations")
        .select("property_id, guest_first_name")
        .in("property_id", propertyIds)
        .in("status", ACTIVE_STAY_STATUSES)
        .lte("check_in", now)
        .gte("check_out", now);
      stays = (retry.data ?? []).map((s) => ({
        ...s,
        guest_last_name: null,
        guest_label_override: null,
      }));
    }
    for (const s of stays ?? []) {
      const pid = s.property_id as string;
      if (occupiedByProperty.has(pid)) continue;
      const override = (s as { guest_label_override?: string | null })
        .guest_label_override?.trim();
      const first = (s.guest_first_name as string | null)?.trim() || null;
      const last = (s as { guest_last_name?: string | null }).guest_last_name
        ?.trim();
      const label =
        override ||
        (last ? `The ${last}s` : first) ||
        "Guest";
      occupiedByProperty.set(pid, label);
    }
  }

  // J2: active joined groups → member properties count as occupied and
  // carry a "joined" badge (TVs already serve the joined listing per J1).
  const memberJoin = new Map<
    string,
    { name: string; joinedPropertyId: string; guestLabel: string | null }
  >();
  try {
    const { joinedGroupsStatus } = await import("./joined-stays");
    const statuses = await joinedGroupsStatus();
    for (const g of statuses) {
      if (!g.active) continue;
      for (const mid of g.memberPropertyIds) {
        if (memberJoin.has(mid)) continue;
        memberJoin.set(mid, {
          name: g.name,
          joinedPropertyId: g.joinedPropertyId,
          guestLabel: g.guestLabel,
        });
      }
    }
  } catch {
    // Joined config missing/broken → fleet still shows per-property occupancy.
  }

  return rows.map((d) => {
    const property = Array.isArray(d.properties) ? d.properties[0] : d.properties;
    const pid = d.property_id as string | null;
    const join = pid ? memberJoin.get(pid) : undefined;
    let occupied: boolean | null = pid ? occupiedByProperty.has(pid) : null;
    let guest_label: string | null =
      pid && occupied ? occupiedByProperty.get(pid) ?? null : null;
    if (join && pid) {
      // Live joined stay (or force-on): member house is "occupied" for fleet.
      occupied = true;
      guest_label = join.guestLabel || guest_label || "Joined stay";
    }
    return {
      id: d.id as string,
      label: (d.label as string | null) ?? null,
      pair_code: d.pair_code as string,
      property_id: pid,
      property_name: property?.name ?? null,
      claimed_at: d.claimed_at as string | null,
      last_seen: d.last_seen as string,
      occupied,
      guest_label,
      joined_name: join?.name ?? null,
      joined_property_id: join?.joinedPropertyId ?? null,
    };
  });
}

/** Link (or move) a TV to a property; null unlinks it back to pairing mode.
 *  The TV notices within one poll cycle (~30s). */
export async function assignTvDevice(
  deviceId: string,
  propertyId: string | null
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db
    .from("tv_devices")
    .update({
      property_id: propertyId,
      claimed_at: propertyId ? new Date().toISOString() : null,
    })
    .eq("id", deviceId);
  if (error) return false;
  // S5.1: auto-label / device class / optional Beach seed on link.
  if (propertyId) {
    const { applyPairProfileOnClaim } = await import("./pair-profile");
    await applyPairProfileOnClaim({ deviceId, propertyId });
  }
  return true;
}

export async function renameTvDevice(
  deviceId: string,
  label: string
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db
    .from("tv_devices")
    .update({ label: label.slice(0, 60) || null })
    .eq("id", deviceId);
  return !error;
}

/** Remove a device row entirely (e.g. a TV that was replaced). If the TV is
 *  still running, it re-registers with a fresh pairing code on next poll. */
export async function forgetTvDevice(deviceId: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { error } = await db.from("tv_devices").delete().eq("id", deviceId);
  return !error;
}

export async function claimTvDevice(
  pairCode: string,
  propertyId: string
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const { data } = await db
    .from("tv_devices")
    .update({ property_id: propertyId, claimed_at: new Date().toISOString() })
    .eq("pair_code", pairCode.toUpperCase())
    .is("property_id", null)
    .select("id");
  if (!data?.length) return false;
  // S5.1 pair profile on code-claim path too.
  const { applyPairProfileOnClaim } = await import("./pair-profile");
  await applyPairProfileOnClaim({
    deviceId: data[0].id as string,
    propertyId,
  });
  return true;
}
