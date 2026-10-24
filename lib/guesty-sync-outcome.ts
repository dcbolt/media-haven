/** Whether guesty_last_sync_at may advance after a sync pass (F-905). */

export function shouldRecordGuestyLastSync(flags: {
  listingsOk: boolean;
  guestReservationsOk: boolean;
  ownerReservationsOk: boolean;
  reservationWritesOk: boolean;
}): boolean {
  return (
    flags.listingsOk &&
    flags.guestReservationsOk &&
    flags.ownerReservationsOk &&
    flags.reservationWritesOk
  );
}
