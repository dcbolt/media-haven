/**
 * Cross-property upsell (host 2026-07-17). The portfolio: two campuses,
 * four rentable units, plus whole-property listings for larger groups.
 *
 *   The Havens at The Dunes   = Turtle Haven + Shell Haven (beachfront villas)
 *   The Havens at Beach Street = Sea Haven + Beach Haven (beachside homes)
 *
 * Ranking rules: Turtle Haven is the crown jewel; the only step up from a
 * Dunes villa is renting the whole Dunes property. Beach Street TVs always
 * pitch the Dunes villas; Dunes TVs never "downsell" to Beach Street — they
 * pitch the whole property, with Beach Street framed as overflow for big
 * gatherings. Every variant lands on direct booking.
 */

export type UpsellPitch = {
  eyebrow: string;
  headline: string;
  body: string;
  /** Whole-property Guesty listing to deep-link, or null for the main
   *  booking page. */
  guestyId: string | null;
  qrLabel: string;
};

/** Stable Guesty listing ids for the whole-property rentals. */
const DUNES_WHOLE_GUESTY_ID = "69309090f87e65003c635474";

export function upsellFor(propertyName: string): UpsellPitch {
  const n = propertyName.toLowerCase();
  const wholeProperty = /havens at/.test(n);
  const dunes = /turtle haven|shell haven|the dunes/.test(n);
  const beachStreet = /sea haven|beach haven|beach street/.test(n);

  if (beachStreet) {
    // Condos → the beachfront villas are the natural next stay.
    return {
      eyebrow: "More Havens to explore",
      headline: "Our beachfront villas at The Dunes",
      body:
        "Turtle Haven and Shell Haven sit right on the sand at The Dunes — " +
        "protected sea-turtle nesting grounds, each villa with its own " +
        "heated pool & spa. Bringing the whole crew? Rent The Havens at " +
        "The Dunes and take both villas together.",
      guestyId: DUNES_WHOLE_GUESTY_ID,
      qrLabel: "See The Dunes",
    };
  }
  if (dunes && !wholeProperty) {
    // A single Dunes villa → the only upgrade is the whole property.
    return {
      eyebrow: "Bringing everyone next time?",
      headline: "Take the whole property",
      body:
        "Rent The Havens at The Dunes — both beachfront villas, two heated " +
        "pools & spas, one shared stretch of sand — and keep the whole " +
        "family steps apart, never on top of each other.",
      guestyId: DUNES_WHOLE_GUESTY_ID,
      qrLabel: "See the whole property",
    };
  }
  if (dunes && wholeProperty) {
    // They already hold the flagship — awareness, not an upgrade pitch.
    return {
      eyebrow: "Even bigger gatherings",
      headline: "Four Havens, one family reunion",
      body:
        "Multi-family trip on the horizon? Our Beach Street havens — Sea " +
        "Haven and Beach Haven, each with a heated pool & spa — put the " +
        "overflow crew minutes away, all booked in one place.",
      guestyId: null,
      qrLabel: "Explore all four Havens",
    };
  }
  // Unknown property — pure direct-book awareness.
  return {
    eyebrow: "The Florida Havens",
    headline: "Four havens, two beachfront properties",
    body:
      "From intimate escapes to whole-family reunions — Turtle Haven, " +
      "Shell Haven, Sea Haven, and Beach Haven are all bookable directly, " +
      "with the best rates always on our own site.",
    guestyId: null,
    qrLabel: "Explore the Havens",
  };
}
