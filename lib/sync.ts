import {
  ACTIVE_STAY_STATUSES,
  extractPhotos,
  extractWifi,
  getListings,
  getUpcomingOwnerReservations,
  getUpcomingReservations,
  guestyConfigured,
  type GuestyReservation,
} from "./guesty";
import { shouldIssueGuestTokenForReservation } from "./guesty-sync-helpers";
import { shouldRecordGuestyLastSync } from "./guesty-sync-outcome";
import { supabaseAdmin } from "./supabase";
import { syncNamedBlocksForAllListings } from "./sync-named-blocks";
import { ensureGuestToken } from "./tokens";

/** Guesty statuses that represent a real stay. Everything else (inquiry,
 *  canceled, declined, expired, closed) gets no guest link. Canonical list
 *  lives in lib/guesty.ts (ACTIVE_STAY_STATUSES) — every occupancy query
 *  filters on it too. */
export const ACTIVE_STATUSES = new Set(ACTIVE_STAY_STATUSES);

/** Family name for the formal TV lockup. A single-word fullName is a first
 *  name, not a surname — never present "The Alexes". */
function guestLastName(guest: {
  fullName?: string;
  lastName?: string;
}): string | null {
  if (guest.lastName) return guest.lastName;
  const words = guest.fullName?.trim().split(/\s+/) ?? [];
  return words.length > 1 ? words[words.length - 1] : null;
}

async function recordGuestyLastSync(db: NonNullable<ReturnType<typeof supabaseAdmin>>) {
  await db.from("app_config").upsert({
    key: "guesty_last_sync_at",
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

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

  let listingsOk = true;
  let guestReservationsOk = true;
  let ownerReservationsOk = true;
  let reservationWritesOk = true;

  const listings = await getListings();
  let count = 0;

  for (const listing of listings) {
    const wifi = extractWifi(listing);
    const photos = extractPhotos(listing);
    const base: Record<string, unknown> = {
      guesty_id: listing._id,
      name: listing.title,
      hero_image_url: listing.picture?.large ?? photos[0] ?? null,
      photos,
      latitude: listing.address?.lat ?? null,
      longitude: listing.address?.lng ?? null,
    };
    if (wifi.ssid) base.wifi_ssid = wifi.ssid;
    if (wifi.password) base.wifi_password = wifi.password;

    const { error } = await db
      .from("properties")
      .upsert(base, { onConflict: "guesty_id" });
    if (error) listingsOk = false;
    else count++;
  }

  const [guestSettled, ownerSettled] = await Promise.allSettled([
    getUpcomingReservations(),
    getUpcomingOwnerReservations(),
  ]);

  let guestReservations: GuestyReservation[] = [];
  if (guestSettled.status === "fulfilled") {
    guestReservations = guestSettled.value;
  } else {
    guestReservationsOk = false;
    console.error("[guesty-sync] getUpcomingReservations failed", guestSettled.reason);
  }

  let ownerReservations: GuestyReservation[] = [];
  if (ownerSettled.status === "fulfilled") {
    ownerReservations = ownerSettled.value;
  } else {
    ownerReservationsOk = false;
    console.error(
      "[guesty-sync] getUpcomingOwnerReservations failed",
      ownerSettled.status === "rejected" ? ownerSettled.reason : "unknown"
    );
  }

  const byGuestyId = new Map<string, GuestyReservation>();
  for (const r of guestReservations) byGuestyId.set(r._id, r);
  for (const r of ownerReservations) byGuestyId.set(r._id, r);
  const reservations = [...byGuestyId.values()];
  const reservationGuestyIds = new Set(reservations.map((r) => r._id));

  for (const r of reservations) {
    const { data: property } = await db
      .from("properties")
      .select("id")
      .eq("guesty_id", r.listingId)
      .maybeSingle();
    if (!property) continue;
    const { data: upserted, error } = await db
      .from("reservations")
      .upsert(
        {
          guesty_id: r._id,
          property_id: property.id,
          guest_first_name:
            r.guest.firstName ?? r.guest.fullName?.split(" ")[0] ?? null,
          guest_last_name: guestLastName(r.guest),
          check_in: r.checkIn,
          check_out: r.checkOut,
          status: r.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guesty_id" }
      )
      .select("id")
      .maybeSingle();
    if (error || !upserted) {
      reservationWritesOk = false;
      continue;
    }
    if (shouldIssueGuestTokenForReservation(r)) {
      await ensureGuestToken(upserted.id, r.checkOut);
    }
  }

  await syncNamedBlocksForAllListings(
    listings.map((l) => l._id),
    reservationGuestyIds
  );

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

  const syncOk = shouldRecordGuestyLastSync({
    listingsOk,
    guestReservationsOk,
    ownerReservationsOk,
    reservationWritesOk,
  });

  if (syncOk) {
    await recordGuestyLastSync(db);
  }

  if (!syncOk) {
    return { ok: false, reason: "partial-sync-failure" };
  }

  return { ok: true, count };
}
