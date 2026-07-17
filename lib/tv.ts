import QRCode from "qrcode";
import { bookingUrlFor } from "./booking";
import {
  DEMO_PROPERTY_NAME,
  DEMO_SECTIONS,
  legacySections,
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
import { enabledServices } from "./streaming";
import { ensureGuestToken, portalBaseUrl } from "./tokens";
import { supabaseAdmin } from "./supabase";
import { fetchTides, sampleTides, type TideEvent } from "./tides";

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
  checkOut: string | null;
  weather: { tempF: number; label: string } | null;
  sun: { sunrise: string; sunset: string } | null;
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
  }[];
  /** QR to the current guest's phone portal (one-tap sign-in links) —
   *  the least-annoying path into a TV app: scan once, tap the service,
   *  type the code. Null when the property is unoccupied. */
  portalQr: string | null;
  /** Direct-booking site QR — the rebooking pitch on the last slide. */
  bookUrl: string;
  bookQr: string;
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

const WEATHER_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  51: "Light drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  80: "Showers",
  95: "Thunderstorms",
};

async function fetchWeather(
  lat: number,
  lon: number
): Promise<{ weather: TvContent["weather"]; sun: TvContent["sun"] }> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto&temperature_unit=fahrenheit`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } }
    );
    if (!res.ok) return { weather: null, sun: null };
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const weather =
      data.current?.temperature_2m == null
        ? null
        : {
            tempF: Math.round(data.current.temperature_2m),
            label: WEATHER_LABELS[data.current.weather_code ?? -1] ?? "",
          };
    const sun =
      data.daily?.sunrise?.[0] && data.daily?.sunset?.[0]
        ? { sunrise: data.daily.sunrise[0], sunset: data.daily.sunset[0] }
        : null;
    return { weather, sun };
  } catch {
    return { weather: null, sun: null }; // decoration — never break the screen
  }
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

async function demoContent(): Promise<TvContent> {
  // Local/dev photo stand-ins (prod demo mode simply shows no photo slides).
  const demoPhotos = (process.env.DEMO_PHOTO_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const [{ weather, sun }, launches, tides, screensavers] = await Promise.all([
    within(
      fetchWeather(28.06, -80.56), // Melbourne Beach, FL
      SOURCE_BUDGET_MS,
      { weather: null, sun: null },
      "weather"
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
    checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
    weather,
    sun: sun ?? {
      sunrise: `${new Date().toISOString().slice(0, 10)}T06:32`,
      sunset: `${new Date().toISOString().slice(0, 10)}T20:19`,
    },
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
      feeds?: Record<string, boolean>;
      streaming?: Record<string, boolean>;
    } | null;
  }
  const PROPERTY_COLUMNS =
    "name, guesty_id, hero_image_url, photos, logo_url, wifi_ssid, wifi_password, house_rules, local_guide, emergency_info, latitude, longitude";
  // settings arrives with migration 0011; fall back gracefully until it runs.
  let property = (
    await db
      .from("properties")
      .select(`${PROPERTY_COLUMNS}, settings`)
      .eq("id", device.property_id)
      .maybeSingle()
  ).data as PropertyContentRow | null;
  if (!property) {
    property = (
      await db
        .from("properties")
        .select(PROPERTY_COLUMNS)
        .eq("id", device.property_id)
        .maybeSingle()
    ).data as PropertyContentRow | null;
  }
  if (!property) return { mode: "pairing", pairCode: device.pair_code };

  // CMS feed toggles (settings.feeds.<name>: false disables the feed/slide).
  const feeds = property.settings?.feeds ?? {};
  const feedOn = (k: string) => feeds[k] !== false;

  const now = new Date().toISOString();
  const { data: current } = await db
    .from("reservations")
    .select("id, guest_first_name, check_out")
    .eq("property_id", device.property_id)
    .neq("status", "checked_out")
    .lte("check_in", now)
    .gte("check_out", now)
    .order("check_in", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  let sections = await loadSections(device.property_id);
  if (sections.length === 0) sections = legacySections(property);
  const photos: string[] = Array.isArray(property.photos)
    ? (property.photos as string[]).filter((u) => typeof u === "string")
    : [];

  const [launches, tides, screensavers, weatherSun] = await Promise.all([
    feedOn("launches")
      ? within(fetchUpcomingLaunches(), SOURCE_BUDGET_MS, null, "launches")
      : Promise.resolve(null),
    feedOn("tides")
      ? within(fetchTides(), SOURCE_BUDGET_MS, null, "tides")
      : Promise.resolve(null),
    within(listScreensavers(device.property_id), SOURCE_BUDGET_MS, [], "screensavers"),
    within(
      feedOn("weather") && property.latitude != null && property.longitude != null
        ? fetchWeather(property.latitude, property.longitude)
        : Promise.resolve({ weather: null, sun: null }),
      SOURCE_BUDGET_MS,
      { weather: null, sun: null },
      "weather"
    ),
  ]);

  return {
    mode: "active",
    content: {
      propertyName: property.name,
      occupied: Boolean(current),
      wifiSsid: property.wifi_ssid,
      wifiPassword: property.wifi_password,
      wifiQr:
        property.wifi_ssid && property.wifi_password
          ? await wifiJoinQr(property.wifi_ssid, property.wifi_password)
          : null,
      sections: sections.filter((s) => s.showOnTv),
      guestFirstName: current?.guest_first_name ?? null,
      checkOut: current?.check_out ?? null,
      weather: weatherSun.weather,
      sun: weatherSun.sun,
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
      deviceLabel: device.label ?? null,
      streaming: await streamingContent(property.settings?.streaming),
      portalQr: await portalQrFor(guestPortal?.url ?? null),
      bookUrl: bookingUrlFor(property.guesty_id),
      bookQr: await bookDirectQr(bookingUrlFor(property.guesty_id)),
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
