import {
  blockGuestyId,
  GUESTY_BLOCK_PREFIX,
  namedBlocksFromCalendar,
  type NamedBlockStay,
} from "./named-blocks";
import { getListingCalendar } from "./guesty";
import { supabaseAdmin } from "./supabase";
import { ensureGuestToken } from "./tokens";

const LOOKBACK_DAYS = 2;
const LOOKAHEAD_DAYS = 120;

function ymdOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function namedBlockCalendarWindow(): { from: string; to: string } {
  return { from: ymdOffset(-LOOKBACK_DAYS), to: ymdOffset(LOOKAHEAD_DAYS) };
}

export async function reconcileNamedBlocksForProperty(opts: {
  propertyId: string;
  listingId: string;
  stays: NamedBlockStay[];
}): Promise<{ upserted: number; ended: number }> {
  const db = supabaseAdmin();
  if (!db) return { upserted: 0, ended: 0 };

  const keep = new Set<string>();
  let upserted = 0;

  for (const stay of opts.stays) {
    const guestyId = blockGuestyId(stay.blockId);
    keep.add(guestyId);
    const base = {
      guesty_id: guestyId,
      property_id: opts.propertyId,
      guest_first_name: stay.guestFirstName,
      check_in: stay.checkIn,
      check_out: stay.checkOut,
      status: "confirmed",
      updated_at: new Date().toISOString(),
    };
    const firstTry = await db
      .from("reservations")
      .upsert({ ...base, guest_last_name: stay.guestLastName }, { onConflict: "guesty_id" })
      .select("id")
      .maybeSingle();
    // guest_last_name arrives with migration 0014.
    const row = firstTry.error
      ? (
          await db
            .from("reservations")
            .upsert(base, { onConflict: "guesty_id" })
            .select("id")
            .maybeSingle()
        ).data
      : firstTry.data;
    if (row?.id) {
      upserted += 1;
      await ensureGuestToken(row.id, stay.checkOut);
    }
  }

  const { data: existing } = await db
    .from("reservations")
    .select("id, guesty_id")
    .eq("property_id", opts.propertyId)
    .like("guesty_id", `${GUESTY_BLOCK_PREFIX}%`);

  let ended = 0;
  const stale = (existing ?? []).filter(
    (r) => r.guesty_id && !keep.has(r.guesty_id)
  );
  if (stale.length) {
    const ids = stale.map((r) => r.id);
    await db.from("guest_tokens").delete().in("reservation_id", ids);
    await db
      .from("reservations")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .in("id", ids);
    ended = stale.length;
  }

  return { upserted, ended };
}

/**
 * Fetch one listing's calendar and upsert named blocks onto its property
 * row. Failed fetches do **not** wipe existing gblock rows (never-blank:
 * a transient Guesty blip must not vacate an in-house named stay).
 */
export async function syncNamedBlocksForListing(
  listingId: string
): Promise<
  | { ok: true; upserted: number; ended: number; named: number }
  | { ok: false; reason: string }
> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, reason: "storage-not-configured" };

  const { data: property } = await db
    .from("properties")
    .select("id")
    .eq("guesty_id", listingId)
    .maybeSingle();
  if (!property) return { ok: false, reason: "unknown-listing" };

  const { from, to } = namedBlockCalendarWindow();
  const payload = await getListingCalendar(listingId, from, to);
  if (payload == null) return { ok: false, reason: "calendar-unavailable" };

  const stays = namedBlocksFromCalendar(payload).filter(
    (s) => !s.listingId || s.listingId === listingId
  );
  const result = await reconcileNamedBlocksForProperty({
    propertyId: property.id,
    listingId,
    stays,
  });
  return { ok: true, named: stays.length, ...result };
}

export async function syncNamedBlocksForAllListings(
  listingIds: string[]
): Promise<{ listings: number; upserted: number; ended: number }> {
  let upserted = 0;
  let ended = 0;
  let listings = 0;
  for (const listingId of listingIds) {
    const result = await syncNamedBlocksForListing(listingId);
    if (result.ok) {
      listings += 1;
      upserted += result.upserted;
      ended += result.ended;
    }
  }
  return { listings, upserted, ended };
}

export function listingIdFromCalendarWebhook(parsed: {
  event?: string;
  listingId?: string;
  listing?: { _id?: string };
  calendar?: { listingId?: string }[];
  dateRange?: { start?: string; end?: string };
}): string | null {
  if (typeof parsed.listingId === "string" && parsed.listingId) {
    return parsed.listingId;
  }
  if (parsed.listing?._id) return parsed.listing._id;
  const fromDay = parsed.calendar?.find((d) => d.listingId)?.listingId;
  return fromDay || null;
}

export function isCalendarWebhookEvent(parsed: {
  event?: string;
  calendar?: unknown;
  dateRange?: unknown;
  listingId?: string;
}): boolean {
  const event = String(parsed.event ?? "");
  if (event.includes("calendar")) return true;
  if (Array.isArray(parsed.calendar)) return true;
  if (parsed.dateRange && parsed.listingId) return true;
  return false;
}
