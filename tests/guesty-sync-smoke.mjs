/**
 * Guesty sync / cron / calendar freshness fixtures (no network, no Supabase).
 */
import { guestySyncBadge } from "../lib/calendar-sync-badge.ts";
import { verifyCronBearer } from "../lib/cron-auth.ts";
import {
  guesty429ShouldRetry,
  guesty429SleepMs,
  GUESTY_429_MAX_TOTAL_SLEEP_MS,
} from "../lib/guesty-fetch-policy.ts";
import {
  dedupeNamedStaysAgainstReservations,
  guestyIdForNamedStay,
  isOwnerGuestyReservation,
  mapOwnerReservationStatus,
  shouldIssueGuestTokenForReservation,
} from "../lib/guesty-sync-helpers.ts";
import {
  GUESTY_MAX_PAGES,
  GUESTY_MAX_RESULTS,
  GUESTY_PAGE_SIZE,
  shouldFetchAnotherGuestyPage,
} from "../lib/guesty-pagination.ts";
import { shouldRecordGuestyLastSync } from "../lib/guesty-sync-outcome.ts";

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
  "owner status: cancelled alias → canceled",
  mapOwnerReservationStatus("cancelled") === "canceled"
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

check(
  "pagination stops on short page",
  !shouldFetchAnotherGuestyPage(0, 42, 42)
);
check(
  "pagination continues on full page",
  shouldFetchAnotherGuestyPage(0, GUESTY_PAGE_SIZE, GUESTY_PAGE_SIZE)
);
check(
  "pagination stops at max results",
  !shouldFetchAnotherGuestyPage(10, GUESTY_PAGE_SIZE, GUESTY_MAX_RESULTS)
);
check(
  "pagination stops at page cap",
  !shouldFetchAnotherGuestyPage(GUESTY_MAX_PAGES - 1, GUESTY_PAGE_SIZE, 1000)
);

{
  let total = 0;
  let attempt = 0;
  while (guesty429ShouldRetry(attempt, total)) {
    const delay = guesty429SleepMs(attempt);
    total += delay;
    attempt += 1;
  }
  check(
    "429 retry total sleep under function budget",
    total <= GUESTY_429_MAX_TOTAL_SLEEP_MS && total < 60_000
  );
  check("429 retry attempts bounded", attempt >= 1 && attempt <= 6);
}

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
check(
  "owner calendar block gets no guest token",
  !shouldIssueGuestTokenForReservation({
    status: "confirmed",
    source: "owner",
    isOwnerStay: true,
  })
);
check(
  "guest confirmed stay gets token",
  shouldIssueGuestTokenForReservation({ status: "confirmed", source: "airbnb2" })
);

const badgeUnknown = guestySyncBadge(null, Date.now());
check(
  "badge unknown is stale",
  badgeUnknown.syncStale && badgeUnknown.lastSyncedLabel === "unknown"
);
const badgeFresh = guestySyncBadge(new Date().toISOString(), Date.now());
check("badge fresh is not stale", !badgeFresh.syncStale);
const badgeBadDate = guestySyncBadge("not-a-valid-date", Date.now());
check(
  "badge invalid date is stale",
  badgeBadDate.syncStale && badgeBadDate.lastSyncedLabel === "unknown"
);

check(
  "partial failure skips last-sync stamp when owner fetch fails",
  !shouldRecordGuestyLastSync({
    listingsOk: true,
    guestReservationsOk: true,
    ownerReservationsOk: false,
    reservationWritesOk: true,
  })
);
check(
  "full success may stamp last-sync",
  shouldRecordGuestyLastSync({
    listingsOk: true,
    guestReservationsOk: true,
    ownerReservationsOk: true,
    reservationWritesOk: true,
  })
);

const prevSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-cron-secret-value";
check("cron auth rejects missing header", !verifyCronBearer(null));
check(
  "cron auth rejects wrong bearer",
  !verifyCronBearer("Bearer wrong")
);
check(
  "cron auth rejects same-length wrong bearer",
  !verifyCronBearer("Bearer xest-cron-secret-valu")
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
