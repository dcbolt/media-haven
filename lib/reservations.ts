import {
  DEMO_PROPERTY_NAME,
  DEMO_SECTIONS,
  legacySections,
  type GuideSection,
} from "./content";
import { supabaseAdmin } from "./supabase";

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
  property: {
    name: string;
    heroImageUrl: string | null;
    wifiSsid: string | null;
    wifiPassword: string | null;
    sections: GuideSection[];
  };
}

const DEMO_VIEW: GuestView = {
  guestFirstName: "Alex",
  checkIn: new Date(Date.now() - 86400_000).toISOString(),
  checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
  property: {
    name: DEMO_PROPERTY_NAME,
    heroImageUrl: null,
    wifiSsid: "TheDunes-Guest",
    wifiPassword: "SeaTurtle2026!",
    sections: DEMO_SECTIONS,
  },
};

export async function loadSections(propertyId: string): Promise<GuideSection[]> {
  const db = supabaseAdmin();
  if (!db) return DEMO_SECTIONS;
  const { data } = await db
    .from("property_sections")
    .select("slug, title, body, show_on_tv")
    .eq("property_id", propertyId)
    .order("sort");
  return (data ?? []).map((s) => ({
    slug: s.slug,
    title: s.title,
    body: s.body,
    showOnTv: s.show_on_tv,
  }));
}

/**
 * Resolve a QR token to everything the welcome screen needs.
 * Returns null for unknown/expired tokens. The literal token "demo" always
 * resolves to mock data so the flow is testable with zero setup.
 */
export async function resolveGuestToken(token: string): Promise<GuestView | null> {
  if (token === "demo") return DEMO_VIEW;

  const db = supabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from("guest_tokens")
    .select(
      `expires_at,
       reservations (
         guest_first_name, check_in, check_out,
         properties (
           id, name, hero_image_url, wifi_ssid, wifi_password,
           house_rules, local_guide, emergency_info
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

  return {
    guestFirstName: reservation.guest_first_name ?? "Guest",
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    property: {
      name: property.name,
      heroImageUrl: property.hero_image_url,
      wifiSsid: property.wifi_ssid,
      wifiPassword: property.wifi_password,
      sections,
    },
  };
}
