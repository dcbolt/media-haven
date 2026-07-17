/**
 * Sea turtle season awareness for Melbourne Beach — the properties sit on
 * the Archie Carr National Wildlife Refuge, one of the most important
 * loggerhead nesting beaches in the Western Hemisphere. The TV slide keys
 * its message to where the season actually is (host request 2026-07-17).
 *
 * Season shape (Brevard County): leatherbacks begin nesting in March,
 * loggerheads/greens peak May–August, hatchlings emerge ~60 days after
 * nesting — first boils in July, running through October.
 */

export interface TurtleSeason {
  phase: "early-nesting" | "nesting" | "nesting-and-hatching" | "hatching" | "off";
  eyebrow: string;
  headline: string;
  sub: string;
  facts: string[];
  rules: string[];
}

const FACTS = [
  "This beach is part of the Archie Carr National Wildlife Refuge — one of the most important loggerhead nesting beaches in the Western Hemisphere.",
  "Loggerhead, green, and leatherback sea turtles all nest on this stretch of sand.",
  "A female lays about 100 eggs per nest and can nest several times in one season.",
  "Eggs incubate roughly 60 days, and hatchlings almost always emerge at night.",
  "Hatchlings find the ocean by the bright horizon over the water — artificial light can lead them the wrong way.",
];

const RULES = [
  "Lights out beachside after 9 PM — close the blinds, and skip flashlights and phone lights on the sand (red LED only).",
  "Watch nesting turtles from behind and at a distance — never touch or crowd a turtle, nest, or hatchling.",
  "Fill in holes and flatten sandcastles before you leave; they trap hatchlings.",
  "Bring chairs, tents, and toys off the beach at night.",
  "Marked nests are protected by federal law — give the stakes a wide berth.",
  "See a sick, injured, or disoriented turtle? Call FWC: 1-888-404-FWCC.",
];

/** Pick 3 facts + 4 rules relevant to the date's phase. */
export function turtleSeason(d: Date = new Date()): TurtleSeason {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 4) {
    return {
      phase: "early-nesting",
      eyebrow: "Sea turtle season",
      headline: "Nesting season has begun",
      sub: "Giant leatherbacks are the first to come ashore — nesting runs March through October, so the beach rules below are in effect.",
      facts: [FACTS[0], FACTS[1], FACTS[2]],
      rules: [RULES[0], RULES[1], RULES[3], RULES[5]],
    };
  }
  if (m >= 5 && m <= 6) {
    return {
      phase: "nesting",
      eyebrow: "Sea turtle nesting season",
      headline: "The turtles are nesting",
      sub: "Loggerheads and greens come ashore after dark, most nights. An late-evening walk (no lights) is your best chance to see one — always from behind, at a distance.",
      facts: [FACTS[0], FACTS[2], FACTS[3]],
      rules: [RULES[0], RULES[1], RULES[2], RULES[4]],
    };
  }
  if (m >= 7 && m <= 8) {
    return {
      phase: "nesting-and-hatching",
      eyebrow: "Nesting & hatching season",
      headline: "Hatchlings are emerging — and moms are still arriving",
      sub: "The season's peak: new nests every night and the first nests boiling over with hatchlings racing to the sea, usually well after dark.",
      facts: [FACTS[3], FACTS[4], FACTS[0]],
      rules: [RULES[0], RULES[2], RULES[1], RULES[5]],
    };
  }
  if (m >= 9 && m <= 10) {
    return {
      phase: "hatching",
      eyebrow: "Sea turtle hatching season",
      headline: "Hatchlings are racing to the sea",
      sub: "Most nests have hatched or will soon — emergences happen at night, and every light on the beach can pull hatchlings off course.",
      facts: [FACTS[4], FACTS[3], FACTS[1]],
      rules: [RULES[0], RULES[2], RULES[5], RULES[3]],
    };
  }
  return {
    phase: "off",
    eyebrow: "Sea turtle country",
    headline: "You're on a sea turtle beach",
    sub: "Nesting returns March 1 — for now the sand is resting. Year-round, this shoreline is one of the world's great turtle nurseries.",
    facts: [FACTS[0], FACTS[1], FACTS[2]],
    rules: [RULES[2], RULES[3], RULES[5]],
  };
}
