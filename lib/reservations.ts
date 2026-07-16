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
    houseRules: string | null;
    localGuide: string | null;
    emergencyInfo: string | null;
  };
}

const DEMO_VIEW: GuestView = {
  guestFirstName: "Alex",
  checkIn: new Date(Date.now() - 86400_000).toISOString(),
  checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
  property: {
    name: "Turtle Tide Cottage",
    heroImageUrl: null,
    wifiSsid: "TurtleTide-Guest",
    wifiPassword: "SeaTurtle2026!",
    houseRules:
      "Check-out is 10:00 AM. No smoking anywhere on the property. Lights out on the beach side after 9 PM during turtle nesting season (May–October) — it's the law on the Space Coast. Please run the dishwasher before you leave.",
    localGuide:
      "Sebastian Inlet State Park is 15 minutes south — best surfing on the coast. The Barrier Island Sanctuary has nightly turtle walks in June and July (book ahead). For dinner, locals go to Djon's Steak & Lobster House in town.",
    emergencyInfo:
      "Emergencies: 911. Nearest ER: Holmes Regional Medical Center, 1350 Hickory St, Melbourne (20 min). Host: (321) 555-0142. Breaker panel is in the garage, left wall. Water shutoff is beside the water heater.",
  },
};

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
           name, hero_image_url, wifi_ssid, wifi_password,
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

  return {
    guestFirstName: reservation.guest_first_name ?? "Guest",
    checkIn: reservation.check_in,
    checkOut: reservation.check_out,
    property: {
      name: property.name,
      heroImageUrl: property.hero_image_url,
      wifiSsid: property.wifi_ssid,
      wifiPassword: property.wifi_password,
      houseRules: property.house_rules,
      localGuide: property.local_guide,
      emergencyInfo: property.emergency_info,
    },
  };
}
