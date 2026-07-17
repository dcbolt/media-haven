/**
 * Per-unit direct booking links on the Guesty booking engine. Every surface
 * that says "book direct" (TV farewell + book-direct slides, portal rebooking
 * card) deep-links to the property's own booking page; the brand site is the
 * fallback when no listing id is available (demo mode, unsynced property).
 */

const FALLBACK_BOOK_URL =
  process.env.NEXT_PUBLIC_BOOK_URL ?? "https://www.thefloridahavens.com/book";

const BOOKING_ENGINE_BASE =
  process.env.NEXT_PUBLIC_BOOKING_ENGINE_URL ??
  "https://thefloridahavens.guestybookings.com";

export function bookingUrlFor(guestyId: string | null | undefined): string {
  return guestyId
    ? `${BOOKING_ENGINE_BASE}/en/properties/${guestyId}?minOccupancy=1&adults=1`
    : FALLBACK_BOOK_URL;
}

/** Booking link with the stay dates pre-loaded (Guesty booking engine
 *  checkIn/checkOut params, YYYY-MM-DD) — scanning the farewell QR lands on
 *  the property with next year's dates already selected. */
export function bookingUrlForDates(
  guestyId: string | null | undefined,
  checkIn: string,
  checkOut: string
): string {
  if (!guestyId) return FALLBACK_BOOK_URL;
  return `${bookingUrlFor(guestyId)}&checkIn=${checkIn}&checkOut=${checkOut}`;
}
