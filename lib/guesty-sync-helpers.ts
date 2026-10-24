const GUESTY_BLOCK_PREFIX = "gblock:";

const ACTIVE_STAY_STATUSES = ["confirmed", "reserved", "checked_in"];

const INACTIVE_OWNER_STATUSES = new Set([
  "canceled",
  "cancelled",
  "declined",
  "expired",
  "closed",
  "inquiry",
  "checked_out",
]);

/** Preserve inactive Guesty owner statuses — never coerce canceled → confirmed. */
export function mapOwnerReservationStatus(raw?: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "confirmed";
  if (s === "cancelled") return "canceled";
  if (ACTIVE_STAY_STATUSES.includes(s)) return s;
  if (INACTIVE_OWNER_STATUSES.has(s)) return s;
  return s;
}

export type NamedStayLike = {
  blockId: string;
  linkedReservationId?: string | null;
  isOwnerBlock?: boolean;
};

export function isOwnerGuestyReservation(r: {
  source?: string;
  isOwnerStay?: boolean;
}): boolean {
  return r.source === "owner" || Boolean(r.isOwnerStay);
}

/** Guest portal tokens — never for owner stays / owner calendar blocks. */
export function shouldIssueGuestTokenForReservation(r: {
  status: string;
  source?: string;
  isOwnerStay?: boolean;
}): boolean {
  return (
    ACTIVE_STAY_STATUSES.includes(r.status) && !isOwnerGuestyReservation(r)
  );
}

export function guestyIdForNamedStay(stay: NamedStayLike): string {
  if (stay.linkedReservationId) return stay.linkedReservationId;
  return stay.blockId.startsWith(GUESTY_BLOCK_PREFIX)
    ? stay.blockId
    : `${GUESTY_BLOCK_PREFIX}${stay.blockId}`;
}

export function dedupeNamedStaysAgainstReservations<T extends NamedStayLike>(
  stays: T[],
  reservationGuestyIds: Set<string>
): T[] {
  return stays.filter((stay) => {
    if (!stay.linkedReservationId) return true;
    return !reservationGuestyIds.has(stay.linkedReservationId);
  });
}
