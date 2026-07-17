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
 *
 * Voice (cycle 6): luxury Space Coast calm — short 10-ft lines, sand/pool/
 * privacy, never SaaS-catalog or Viator-tour. Direct book only.
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
    // Beach Street → flagship Dunes (upgrade path, not a peer swap).
    return {
      eyebrow: "Your next stay — on the sand",
      headline: "Turtle Haven & Shell Haven",
      body:
        "Wake to the Atlantic at The Dunes: two private beachfront villas " +
        "beside protected nesting grounds, each with its own heated pool " +
        "and spa. Book one villa — or take both for the whole stretch of sand.",
      guestyId: DUNES_WHOLE_GUESTY_ID,
      qrLabel: "Book The Dunes direct",
    };
  }
  if (dunes && !wholeProperty) {
    // Single Dunes villa → only upgrade is the whole property.
    return {
      eyebrow: "Keep everyone close",
      headline: "Both villas. One shore.",
      body:
        "Next time bring the whole crew — The Havens at The Dunes pairs " +
        "Turtle and Shell with two pools, two spas, and steps between doors " +
        "on shared beachfront. Best rates always book direct.",
      guestyId: DUNES_WHOLE_GUESTY_ID,
      qrLabel: "See the whole property",
    };
  }
  if (dunes && wholeProperty) {
    // Already on flagship — awareness, not a downsell.
    return {
      eyebrow: "When the guest list grows",
      headline: "Four Havens. One reunion.",
      body:
        "Planning multi-family? Sea Haven and Beach Haven on Beach Street " +
        "put overflow guests minutes away — each with a heated pool and spa — " +
        "still one brand, still book direct.",
      guestyId: null,
      qrLabel: "Explore all four Havens",
    };
  }
  // Unknown property — pure direct-book awareness.
  return {
    eyebrow: "The Florida Havens",
    headline: "Four havens. Two campuses.",
    body:
      "Turtle, Shell, Sea, and Beach Haven — private Space Coast homes " +
      "from an intimate escape to a whole-family gathering. Book direct " +
      "for the best rates and first pick of launch-week dates.",
    guestyId: null,
    qrLabel: "Explore the Havens",
  };
}
