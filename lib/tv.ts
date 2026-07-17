import QRCode from "qrcode";
import { bookingUrlFor, bookingUrlForDates } from "./booking";
import { isRangeAvailable } from "./guesty";
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
  | { mode: "demo"; content: TvContent }
  | { mode: "pairing"; pairCode: string }
  | { mode: "active"; content: TvContent };

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
    }[];
    photos: boolean;
  } | null;
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
    items.push(item);
  }
  if (items.length === 0) return null;
  return { items, photos: o.photos !== false };
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

  if (!device) return registerTvDevice(deviceId);
  await db
    .from("tv_devices")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", deviceId);

  if (!device.property_id) return { mode: "pairing", pairCode: device.pair_code };

  const state = await propertyTvState(device.property_id, device.label ?? null);
  return state ?? { mode: "pairing", pairCode: device.pair_code };
}

/** The active-signage state a TV paired to this property would show.
 *  Shared by paired devices and the host preview/thumbnail path (which
 *  passes a propertyId directly — no device rows touched). Null when the
 *  property is missing or the DB isn't configured. */
export async function propertyTvState(
  propertyId: string,
  deviceLabel: string | null
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
      .neq("status", "checked_out")
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
      playlist: signagePlaylist(property.settings?.playlist),
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

  return (data ?? []).map((d) => {
    const property = Array.isArray(d.properties) ? d.properties[0] : d.properties;
    return {
      id: d.id,
      label: d.label,
      pair_code: d.pair_code,
      property_id: d.property_id,
      property_name: property?.name ?? null,
      claimed_at: d.claimed_at,
      last_seen: d.last_seen,
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
  return !error;
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
  return Boolean(data && data.length > 0);
}
