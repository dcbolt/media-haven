import {
  DEMO_PROPERTY_NAME,
  DEMO_SECTIONS,
  legacySections,
  signageName,
  type GuideSection,
} from "./content";
import { bookingUrlFor, bookingUrlForDates } from "./booking";
import { logoFor } from "./logos";
import { enabledServices, type StreamingService } from "./streaming";
import { supabaseAdmin } from "./supabase";
import {
  fetchUpcomingLaunches,
  sampleLaunches,
  type UpcomingLaunch,
} from "./launches";
import { fetchTides, sampleTides, formatTideTime, type TideEvent } from "./tides";
import {
  fetchWeather,
  MELBOURNE_BEACH,
  type SunSnap,
  type WeatherSnap,
} from "./weather";

/**
 * Guest access model: the QR code on the property encodes a short opaque
 * token (guest_tokens table), never a Guesty reservation ID. Raw reservation
 * IDs in a scannable code would let anyone who photographs the QR enumerate
 * reservations — the token layer is the privacy boundary.
 */

export interface GuestView {
  guestFirstName: string;
  checkIn: string;
  checkOut: string;
  /** Within 24h of checkout (last-night / checkout-morning hard conversion). */
  lastNight: boolean;
  /** Checkout is today in local time. */
  departureDay: boolean;
  property: {
    name: string;
    heroImageUrl: string | null;
    logoUrl: string | null;
    wifiSsid: string | null;
    wifiPassword: string | null;
    /**
     * J3: when this stay is on a joined listing, Wi-Fi for each member house
     * (Turtle + Shell, etc.). Empty/null → single wifiSsid card only.
     */
    memberWifi: { name: string; ssid: string; password: string }[] | null;
    sections: GuideSection[];
    /** Per-unit Guesty booking-engine deep link (brand-site fallback). */
    bookUrl: string;
    /**
     * Next-year same dates deep link when guesty_id is known (best-effort;
     * always points at booking engine with date params — availability is
     * confirmed only on TV when Guesty calendar says yes).
     */
    bookUrlNextYear: string;
    /** Streaming services shown to this property's guests (CMS-toggled). */
    streaming: StreamingService[];
  };
  /** Optional Space Coast feeds — null means skip the panel. */
  weather: WeatherSnap | null;
  sun: SunSnap | null;
  tides: TideEvent[] | null;
  launches: UpcomingLaunch[] | null;
}

function plusOneYearYmd(iso: string): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function isLastNight(checkOut: string): boolean {
  const t = new Date(checkOut).getTime();
  return t > Date.now() && t - Date.now() < 24 * 3600_000;
}

function isDepartureDay(checkOut: string): boolean {
  return new Date(checkOut).toDateString() === new Date().toDateString();
}

async function portalFeeds(
  lat: number | null | undefined,
  lon: number | null | undefined
): Promise<{
  weather: WeatherSnap | null;
  sun: SunSnap | null;
  tides: TideEvent[] | null;
  launches: UpcomingLaunch[] | null;
}> {
  const la = lat ?? MELBOURNE_BEACH.lat;
  const lo = lon ?? MELBOURNE_BEACH.lon;
  const [wx, tides, launches] = await Promise.all([
    fetchWeather(la, lo),
    fetchTides(),
    fetchUpcomingLaunches(),
  ]);
  return {
    weather: wx.weather,
    sun: wx.sun,
    tides: tides ?? sampleTides(),
    launches: launches ?? sampleLaunches(),
  };
}

const DEMO_VIEW_BASE = {
  guestFirstName: "Alex",
  checkIn: new Date(Date.now() - 86400_000).toISOString(),
  checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
  property: {
    name: DEMO_PROPERTY_NAME,
    heroImageUrl: process.env.DEMO_PHOTO_URLS?.split(",")[0]?.trim() || null,
    logoUrl: process.env.DEMO_LOGO_URL ?? logoFor(DEMO_PROPERTY_NAME),
    wifiSsid: "TheDunes-Guest",
    wifiPassword: "SeaTurtle2026!",
    memberWifi: null,
    sections: DEMO_SECTIONS,
    bookUrl: bookingUrlFor(null),
    bookUrlNextYear: bookingUrlFor(null),
    streaming: enabledServices(null),
  },
};

export { formatTideTime };

export async function loadSections(propertyId: string): Promise<GuideSection[]> {
  const db = supabaseAdmin();
  if (!db) return DEMO_SECTIONS;
  const { data } = await db
    .from("property_sections")
    .select("slug, title, body, show_on_tv, category")
    .eq("property_id", propertyId)
    .order("sort");
  return (data ?? []).map((s) => ({
    slug: s.slug,
    title: s.title,
    body: s.body,
    showOnTv: s.show_on_tv,
    category: s.category ?? null,
  }));
}

/**
 * Resolve a QR token to everything the welcome screen needs.
 * Returns null for unknown/expired tokens. The literal token "demo" always
 * resolves to mock data so the flow is testable with zero setup.
 */
export async function resolveGuestToken(token: string): Promise<GuestView | null> {
  if (token === "demo") {
    const feeds = await portalFeeds(null, null);
    const checkIn = DEMO_VIEW_BASE.checkIn;
    const checkOut = DEMO_VIEW_BASE.checkOut;
    return {
      ...DEMO_VIEW_BASE,
      checkIn,
      checkOut,
      lastNight: isLastNight(checkOut),
      departureDay: isDepartureDay(checkOut),
      property: { ...DEMO_VIEW_BASE.property },
      ...feeds,
    };
  }

  const db = supabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from("guest_tokens")
    .select(
      `expires_at,
       reservations (
         guest_first_name, check_in, check_out,
         properties (
           id, guesty_id, name, hero_image_url, logo_url, wifi_ssid, wifi_password,
           house_rules, local_guide, emergency_info, settings, latitude, longitude
         )
       )`
    )
    .eq("token", token)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) return null;

  // Supabase typing for embedded resources is loose; normalize here.
  const reservation = Array.isArray(data.reservations)
    ? data.reservations[0]
    : data.reservations;
  if (!reservation) return null;
  const property = Array.isArray(reservation.properties)
    ? reservation.properties[0]
    : reservation.properties;
  if (!property) return null;

  let sections = await loadSections(property.id);
  if (sections.length === 0) sections = legacySections(property);

  const checkIn = reservation.check_in as string;
  const checkOut = reservation.check_out as string;
  const guestyId = property.guesty_id as string | null;
  const bookUrlNextYear = guestyId
    ? bookingUrlForDates(guestyId, plusOneYearYmd(checkIn), plusOneYearYmd(checkOut))
    : bookingUrlFor(null);

  const feeds = await portalFeeds(
    property.latitude as number | null,
    property.longitude as number | null
  );

  // J3: dual-house Wi-Fi when the stay is on a joined listing row.
  let memberWifi: { name: string; ssid: string; password: string }[] | null =
    null;
  try {
    const { memberWifiForJoinedListing } = await import("./joined-stays");
    const members = await memberWifiForJoinedListing(property.id as string);
    if (members.length > 0) memberWifi = members;
  } catch {
    memberWifi = null;
  }

  return {
    guestFirstName: reservation.guest_first_name ?? "Guest",
    checkIn,
    checkOut,
    lastNight: isLastNight(checkOut),
    departureDay: isDepartureDay(checkOut),
    property: {
      name: signageName(
        property.name,
        (property.settings as { displayName?: string | null } | null)
          ?.displayName
      ),
      heroImageUrl: property.hero_image_url,
      logoUrl: property.logo_url ?? logoFor(property.name),
      wifiSsid: property.wifi_ssid,
      wifiPassword: property.wifi_password,
      memberWifi,
      sections,
      bookUrl: bookingUrlFor(guestyId),
      bookUrlNextYear,
      streaming: enabledServices(
        (property.settings as { streaming?: Record<string, boolean> } | null)
          ?.streaming
      ),
    },
    ...feeds,
  };
}
