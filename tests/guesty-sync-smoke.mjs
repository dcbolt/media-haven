/**
 * Guesty sync / cron / calendar freshness fixtures (no network, no Supabase).
 */
import { guestySyncBadge } from "../lib/calendar-sync-badge.ts";
import { verifyCronBearer } from "../lib/cron-auth.ts";
import {
  fetchGuestyResultPages,
  guestyApiGet,
  GUESTY_429_MAX_TOTAL_SLEEP_MS,
  GUESTY_MAX_PAGES,
  GUESTY_MAX_RESULTS,
  GUESTY_PAGE_SIZE,
} from "../lib/guesty-http-loops.ts";
import {
  dedupeNamedStaysAgainstReservations,
  guestyIdForNamedStay,
  isOwnerGuestyReservation,
  mapOwnerReservationStatus,
  shouldIssueGuestTokenForReservation,
} from "../lib/guesty-sync-helpers.ts";
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

{
  const token = async () => "fixture-token";
  let batch = 0;
  const shortPageRows = await fetchGuestyResultPages("/reservations?limit=100", {
    getToken: token,
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      text: async () => "",
      json: async () => ({
        results:
          batch++ === 0
            ? Array.from({ length: GUESTY_PAGE_SIZE }, (_, i) => ({
                _id: `full-${i}`,
              }))
            : Array.from({ length: 42 }, (_, i) => ({ _id: `short-${i}` })),
      }),
    }),
  });
  check(
    "guesty.ts pagination stops on short page",
    shortPageRows.length === GUESTY_PAGE_SIZE + 42 && batch === 2
  );

  let pageFetches = 0;
  const cappedRows = await fetchGuestyResultPages("/reservations?limit=100", {
    getToken: token,
    fetchImpl: async () => {
      pageFetches += 1;
      return {
        status: 200,
        ok: true,
        text: async () => "",
        json: async () => ({
          results: Array.from({ length: GUESTY_PAGE_SIZE }, (_, i) => ({
            _id: `p${pageFetches}-${i}`,
          })),
        }),
      };
    },
  });
  check(
    "guesty.ts pagination stops at page cap",
    pageFetches === GUESTY_MAX_PAGES &&
      cappedRows.length === GUESTY_MAX_RESULTS
  );
}

{
  const token = async () => "fixture-token";
  let calls = 0;
  const sleeps = [];
  const body = await guestyApiGet("/reservations?limit=1", {
    getToken: token,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => {
      calls += 1;
      if (calls <= 2) {
        return {
          status: 429,
          ok: false,
          text: async () => "rate limited",
        };
      }
      return {
        status: 200,
        ok: true,
        text: async () => "",
        json: async () => ({ ok: true }),
      };
    },
  });
  const totalSleep = sleeps.reduce((a, b) => a + b, 0);
  check(
    "guesty.ts 429 retries then succeeds",
    calls === 3 && body.ok === true
  );
  check(
    "guesty.ts 429 total sleep under function budget",
    totalSleep <= GUESTY_429_MAX_TOTAL_SLEEP_MS && totalSleep < 60_000
  );
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
{
  const secret = "test-cron-secret-value";
  const goodHeader = `Bearer ${secret}`;
  const wrongChars = secret.split("");
  wrongChars[0] = wrongChars[0] === "t" ? "u" : "t";
  const badHeader = `Bearer ${wrongChars.join("")}`;
  check(
    "cron same-length wrong bearer is same byte length",
    badHeader.length === goodHeader.length && badHeader !== goodHeader
  );
  check(
    "cron auth rejects same-length wrong bearer",
    !verifyCronBearer(badHeader)
  );
}
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
