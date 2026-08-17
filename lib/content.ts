/**
 * Guide book sections. Structure mirrors thefloridahavens.com/dunes-guide-book.
 *
 * The demo copy below is PLACEHOLDER text written to match the real guide
 * book's section list and tone — the site blocks automated fetching, so the
 * verbatim copy must be pasted in by the host (via property_sections rows
 * once Supabase is live, or by editing this file).
 *
 * ⚠ Seed copy must stay TRUE OF EVERY LISTING. These bodies get cloned across
 * properties by the CMS "Copy setup from…" flow, and once cloned they carry no
 * marker — a sentence that was true of one villa quietly becomes a claim on all
 * six. (Hit for real 2026-08-17: Turtle Haven's beach slide told guests to
 * "swim near a lifeguard" on an unguarded private-walkover beach, and pointed
 * at a garage.) Anything address-, storage-, or amenity-specific belongs in
 * that property's own section body — the host CMS badges cloned bodies so they
 * can be found.
 */

export interface GuideSection {
  slug: string;
  title: string;
  body: string;
  showOnTv: boolean;
  /** TV menu category: 'dining' | 'nearby' | null/undefined = general. */
  category?: string | null;
}

export const DEMO_PROPERTY_NAME = "The Dunes";

/**
 * Signage title for a property. Guesty listing names carry SEO baggage
 * ("Beach Haven - Private Beach Home - Heated Pool & Spa") that reads as a
 * billboard on a TV. Hosts can set an explicit display name (CMS →
 * settings.displayName); otherwise everything after the first dash is
 * trimmed, which turns all six live listings into their short names.
 */
export function signageName(
  name: string,
  displayName?: string | null
): string {
  const custom = displayName?.trim();
  if (custom) return custom;
  return name.split(/\s+[-–—]\s+/)[0].trim() || name;
}

export const DEMO_SECTIONS: GuideSection[] = [
  {
    slug: "arrive",
    title: "When You Arrive",
    body: "Welcome to The Dunes, 4225 & 4227 S Hwy A1A, Melbourne Beach. Parking is in the driveway — please leave the street clear. The door code is in your check-in message. Take a breath, you made it: the beach is steps away.",
    showOnTv: true,
  },
  {
    slug: "rules",
    title: "House Rules",
    body: "No smoking anywhere on the property. No parties or events. Quiet hours after 10 PM — our neighbors are year-round residents. Pets only by prior arrangement. You're on a barrier island: everything you bring to the beach comes back with you.",
    showOnTv: true,
  },
  {
    // Safety copy is deliberately lifeguard-free. A private walkover lands you
    // on an UNGUARDED stretch — "swim near a lifeguard when flags are yellow"
    // (the old wording) is advice a guest here cannot act on, and flag colors
    // are posted at guarded county parks, not at a private beach access.
    // Storage locations (garage / closet / under-deck) are per-listing facts,
    // so they belong in that property's own section body, never in the seed.
    slug: "beach",
    title: "The Beach",
    body: "Your private walkover leads straight onto the sand. Rinse feet and gear at the outdoor shower before coming back in. This stretch has no lifeguard — swim with someone, and keep kids within arm's reach. If a rip current pulls you out, don't fight it: swim parallel to the shore until it lets go, then come in.",
    showOnTv: true,
  },
  {
    slug: "turtles",
    title: "Sea Turtles",
    body: "May through October is nesting season, and this beach is one of the most important loggerhead nesting sites in the world. Lights out on the ocean side after 9 PM — it's the law. Never approach a nesting turtle, fill in any holes you dig, and take everything off the beach at night.",
    showOnTv: true,
  },
  {
    slug: "launches",
    title: "Rocket Launches",
    body: "You're miles from Kennedy Space Center with front-row seats. Watch from the conservation beach or the elevated decks for an unobstructed view up the coast. Day launches are cool; night launches are unforgettable. Check visitspacecoast.com/launches for the schedule during your stay.",
    showOnTv: true,
  },
  {
    slug: "pool",
    title: "The Pool & Spa",
    body: "The pool is serviced weekly. The spa heater takes about 30 minutes — switch is on the panel by the pool equipment. No glass anywhere on the pool deck, please.",
    showOnTv: true,
  },
  {
    slug: "kitchen-grill",
    title: "The Kitchen & Grill",
    body: "The kitchen is fully stocked — help yourself to pantry staples. The gas grill is on the deck; the spare propane tank is in the garage. Please clean the grates after use and turn the tank valve off.",
    showOnTv: false,
  },
  {
    slug: "food",
    title: "Food & Dining",
    body: "Locals' picks: Djon's Steak & Lobster House for a night out, Sand on the Beach for toes-in-the-sand dining, and Southern Sisters for breakfast. Publix is 10 minutes north for groceries.",
    showOnTv: true,
  },
  {
    slug: "activities",
    title: "Activities & Attractions",
    body: "Sebastian Inlet State Park (15 min south) — the best surfing on the coast. Barrier Island Sanctuary — guided turtle walks in June and July, book ahead. Kennedy Space Center Visitor Complex is about an hour north and worth the trip.",
    showOnTv: true,
  },
  {
    slug: "leave",
    title: "Before You Leave",
    body: "Check-out is 10:00 AM. Start the dishwasher, bag the trash into the outside bins, and leave used towels in the laundry room. Lock all doors and sliders. Safe travels — we'd love to have you back.",
    showOnTv: true,
  },
];

/** Legacy fallback: properties created before property_sections existed
 *  carry three text columns; present them as sections. */
export function legacySections(p: {
  house_rules: string | null;
  local_guide: string | null;
  emergency_info: string | null;
}): GuideSection[] {
  const sections: GuideSection[] = [];
  if (p.house_rules)
    sections.push({ slug: "rules", title: "House rules", body: p.house_rules, showOnTv: true });
  if (p.local_guide)
    sections.push({ slug: "guide", title: "Local guide", body: p.local_guide, showOnTv: true });
  if (p.emergency_info)
    sections.push({
      slug: "emergency",
      title: "Emergency & essentials",
      body: p.emergency_info,
      showOnTv: true,
    });
  return sections;
}
