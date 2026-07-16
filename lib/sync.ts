import {
  extractWifi,
  getListings,
  getUpcomingReservations,
  guestyConfigured,
} from "./guesty";
import { supabaseAdmin } from "./supabase";
import { ensureGuestToken } from "./tokens";

/** Guesty statuses that represent a real stay. Everything else (inquiry,
 *  canceled, declined, expired, closed) gets no guest link. */
export const ACTIVE_STATUSES = new Set(["confirmed", "reserved", "checked_in"]);

/**
 * Property sync: Guesty listings → properties table. Guesty is the source of
 * truth for name, photo, coordinates, and per-property Wi-Fi (custom fields).
 * Wi-Fi only overwrites when the Guesty custom field has a value, so a
 * manually-entered password survives until Guesty actually carries one.
 * Guide sections are portal-owned and never touched by sync.
 */
export async function syncGuestyProperties(): Promise<
  { ok: true; count: number } | { ok: false; reason: string }
> {
  if (!guestyConfigured()) {
    return { ok: false, reason: "guesty-not-configured" };
  }
  const db = supabaseAdmin();
  if (!db) return { ok: false, reason: "storage-not-configured" };

  const listings = await getListings();
  let count = 0;

  for (const listing of listings) {
    const wifi = extractWifi(listing);
    const base: Record<string, unknown> = {
      guesty_id: listing._id,
      name: listing.title,
      hero_image_url: listing.picture?.large ?? null,
      latitude: listing.address?.lat ?? null,
      longitude: listing.address?.lng ?? null,
    };
    if (wifi.ssid) base.wifi_ssid = wifi.ssid;
    if (wifi.password) base.wifi_password = wifi.password;

    const { error } = await db
      .from("properties")
      .upsert(base, { onConflict: "guesty_id" });
    if (!error) count++;
  }

  // Backfill current/upcoming reservations; the webhook keeps everything
  // current from here on. Only ACTIVE stays get guest links — inquiries and
  // canceled bookings must never hold a working portal token.
  const reservations = await getUpcomingReservations();
  for (const r of reservations) {
    const { data: property } = await db
      .from("properties")
      .select("id")
      .eq("guesty_id", r.listingId)
      .maybeSingle();
    if (!property) continue;
    const { data: upserted } = await db
      .from("reservations")
      .upsert(
        {
          guesty_id: r._id,
          property_id: property.id,
          guest_first_name:
            r.guest.firstName ?? r.guest.fullName?.split(" ")[0] ?? null,
          check_in: r.checkIn,
          check_out: r.checkOut,
          status: r.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guesty_id" }
      )
      .select("id")
      .maybeSingle();
    if (!upserted) continue;
    if (ACTIVE_STATUSES.has(r.status)) {
      await ensureGuestToken(upserted.id, r.checkOut);
    }
  }

  // Self-heal: revoke any tokens held by non-active reservations (covers
  // rows written before this rule and stays canceled since last sync).
  const { data: inactive } = await db
    .from("reservations")
    .select("id")
    .not("status", "in", `(${[...ACTIVE_STATUSES].join(",")})`);
  if (inactive?.length) {
    await db
      .from("guest_tokens")
      .delete()
      .in(
        "reservation_id",
        inactive.map((r) => r.id)
      );
  }

  return { ok: true, count };
}
