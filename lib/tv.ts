import QRCode from "qrcode";
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
import { loadSections } from "./reservations";
import { listScreensavers, type ScreensaverAsset } from "./screensavers";
import { supabaseAdmin } from "./supabase";

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
  launches: UpcomingLaunch[] | null;
  screensavers: ScreensaverAsset[];
  /** Direct-booking site QR — the rebooking pitch on the last slide. */
  bookUrl: string;
  bookQr: string;
}

const BOOK_URL =
  process.env.NEXT_PUBLIC_BOOK_URL ?? "https://www.thefloridahavens.com/book";

async function bookDirectQr(): Promise<string> {
  return QRCode.toDataURL(BOOK_URL, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#12333f", light: "#ffffff" },
  });
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
): Promise<TvContent["weather"]> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    if (data.current?.temperature_2m == null) return null;
    return {
      tempF: Math.round(data.current.temperature_2m),
      label: WEATHER_LABELS[data.current.weather_code ?? -1] ?? "",
    };
  } catch {
    return null; // weather is decoration — never let it break the screen
  }
}

async function demoContent(): Promise<TvContent> {
  const [weather, launches, screensavers] = await Promise.all([
    fetchWeather(28.06, -80.56), // Melbourne Beach, FL
    fetchUpcomingLaunches(),
    listScreensavers(null),
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
    launches: launches ?? sampleLaunches(),
    screensavers,
    bookUrl: BOOK_URL,
    bookQr: await bookDirectQr(),
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
    .select("pair_code, property_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (!device) return registerTvDevice(deviceId);
  await db
    .from("tv_devices")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", deviceId);

  if (!device.property_id) return { mode: "pairing", pairCode: device.pair_code };

  const { data: property } = await db
    .from("properties")
    .select(
      "name, wifi_ssid, wifi_password, house_rules, local_guide, emergency_info, latitude, longitude"
    )
    .eq("id", device.property_id)
    .single();
  if (!property) return { mode: "pairing", pairCode: device.pair_code };

  const now = new Date().toISOString();
  const { data: current } = await db
    .from("reservations")
    .select("guest_first_name, check_out")
    .eq("property_id", device.property_id)
    .neq("status", "checked_out")
    .lte("check_in", now)
    .gte("check_out", now)
    .order("check_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sections = await loadSections(device.property_id);
  if (sections.length === 0) sections = legacySections(property);

  const [launches, screensavers] = await Promise.all([
    fetchUpcomingLaunches(),
    listScreensavers(device.property_id),
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
      weather:
        property.latitude != null && property.longitude != null
          ? await fetchWeather(property.latitude, property.longitude)
          : null,
      launches,
      screensavers,
      bookUrl: BOOK_URL,
      bookQr: await bookDirectQr(),
    },
  };
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
