/**
 * Guesty sync / cron / calendar freshness fixtures (no network, no Supabase).
 */
import { guestySyncBadge } from "../lib/calendar-sync-badge.ts";
import { verifyCronBearer } from "../lib/cron-auth.ts";
import {
  dedupeNamedStaysAgainstReservations,
  guestyIdForNamedStay,
  isOwnerGuestyReservation,
} from "../lib/guesty-sync-helpers.ts";
import { mapOwnerReservationStatus } from "../lib/guesty-sync-helpers.ts";
import {
  GUESTY_MAX_PAGES,
  GUESTY_PAGE_SIZE,
} from "../lib/guesty-pagination.ts";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(JSON.stringify({ name, pass, detail }));
  if (!pass) failed = 1;
}

check(
  "owner status: canceled preserved",
  mapOwnerReservationStatus("canceled") === "canceled"
);
check(
  "owner status: declined preserved",
  mapOwnerReservationStatus("declined") === "declined"
);
check(
  "owner status: confirmed active",
  mapOwnerReservationStatus("confirmed") === "confirmed"
);
check(
  "owner status: empty defaults confirmed",
  mapOwnerReservationStatus("") === "confirmed"
);
check(
  "owner stay flagged",
  isOwnerGuestyReservation({ source: "owner", isOwnerStay: true })
);
check(
  "guest stay not owner",
  !isOwnerGuestyReservation({ source: "airbnb2" })
);

check(
  "pagination cap constants",
  GUESTY_PAGE_SIZE === 100 && GUESTY_MAX_PAGES === 50
);

const stay = {
  blockId: "res-owner-99",
  listingId: "l1",
  note: "Owner",
  guestFirstName: "Owner",
  guestLastName: "stay",
  linkedReservationId: "res-owner-99",
  isOwnerBlock: true,
  checkIn: "2026-10-23T20:00:00.000Z",
  checkOut: "2026-10-25T14:00:00.000Z",
};
check(
  "dedupe skips linked reservation already synced",
  dedupeNamedStaysAgainstReservations([stay], new Set(["res-owner-99"])).length === 0
);
check(
  "dedupe keeps block when reservation not yet synced",
  dedupeNamedStaysAgainstReservations([stay], new Set()).length === 1
);
check(
  "guesty id for linked owner block is reservation id",
  guestyIdForNamedStay(stay) === "res-owner-99"
);

const badgeUnknown = guestySyncBadge(null, Date.now());
check(
  "badge unknown is stale",
  badgeUnknown.syncStale && badgeUnknown.lastSyncedLabel === "unknown"
);
const badgeFresh = guestySyncBadge(new Date().toISOString(), Date.now());
check("badge fresh is not stale", !badgeFresh.syncStale);

const prevSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-cron-secret-value";
check(
  "cron auth rejects missing header",
  !verifyCronBearer(null)
);
check(
  "cron auth rejects wrong bearer",
  !verifyCronBearer("Bearer wrong")
);
check(
  "cron auth accepts exact bearer",
  verifyCronBearer("Bearer test-cron-secret-value")
);
if (prevSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = prevSecret;

process.env.CRON_SECRET = "";
check(
  "cron auth fails closed when secret unset",
  !verifyCronBearer("Bearer anything")
);
if (prevSecret === undefined) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = prevSecret;

process.exit(failed);
