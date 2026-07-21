/**
 * S4.8 property-type template packs — "pretty in 5 minutes" bootstrap.
 *
 * Client-safe pure catalog (no supabase). Host loads a pack into the
 * signage editor timeline, then publishes or Save as channel.
 * Server seed into orgs.settings.channels: seedTemplateChannels() in
 * lib/signage-pack-seed.ts.
 *
 * Keys must match app/tv/page.tsx + host blockCatalog slide keys.
 */

// Shape matches SignagePlaylist in lib/tv — duplicated as a structural type
// so this module stays client-safe (no value import from lib/tv.ts).
export type PackPlaylist = {
  items: {
    key: string;
    seconds?: number;
    daypart?: string;
  }[];
  photos: boolean;
};

export type SignagePack = {
  /** Stable id when seeded as a channel (tpl-*). */
  id: string;
  name: string;
  blurb: string;
  /** Guest stay timeline vs vacant (between stays) editor mode. */
  mode: "guest" | "vacant";
  items: {
    key: string;
    seconds?: number;
    daypart?: string;
  }[];
  photos: boolean;
};

export const SIGNAGE_PACKS: SignagePack[] = [
  {
    id: "tpl-beach",
    name: "Beach day",
    blurb: "Wi‑Fi, beach weather, tides, turtles, entertainment — classic FH.",
    mode: "guest",
    items: [
      { key: "welcome", seconds: 15 },
      { key: "wifi", seconds: 22 },
      { key: "beach-day", seconds: 25 },
      { key: "forecast-3", seconds: 16 },
      { key: "sea-turtles", seconds: 18 },
      { key: "streaming", seconds: 20 },
      { key: "casting", seconds: 14 },
      { key: "book-direct", seconds: 16 },
    ],
    photos: true,
  },
  {
    id: "tpl-rocket",
    name: "Rocket week",
    blurb: "Launch board early after welcome — Space Coast wow week.",
    mode: "guest",
    items: [
      { key: "welcome", seconds: 12 },
      { key: "wifi", seconds: 16 },
      { key: "launch-board", seconds: 32 },
      { key: "beach-day", seconds: 18 },
      { key: "streaming", seconds: 18 },
      { key: "casting", seconds: 12 },
      { key: "book-direct", seconds: 16 },
    ],
    photos: true,
  },
  {
    id: "tpl-family",
    name: "Family stay",
    blurb: "Longer Wi‑Fi + entertainment coach; great for multi-gen weeks.",
    mode: "guest",
    items: [
      { key: "welcome", seconds: 16 },
      { key: "wifi", seconds: 24 },
      { key: "beach-day", seconds: 18 },
      { key: "forecast-5", seconds: 16 },
      { key: "streaming", seconds: 24 },
      { key: "casting", seconds: 16 },
      { key: "sea-turtles", seconds: 16 },
      { key: "our-havens", seconds: 14 },
      { key: "book-direct", seconds: 16 },
    ],
    photos: true,
  },
  {
    id: "tpl-vacant-luxury",
    name: "Vacant luxury",
    blurb:
      "Between stays: book-direct + upsell + ambience. Add library photos/video after load.",
    mode: "vacant",
    items: [
      { key: "book-direct", seconds: 22 },
      { key: "our-havens", seconds: 22 },
      { key: "beach-day", seconds: 16 },
      { key: "launch-board", seconds: 16 },
    ],
    photos: true,
  },
];

export function packToPlaylist(pack: SignagePack): PackPlaylist {
  return {
    items: pack.items.map((it) => ({
      key: it.key,
      ...(typeof it.seconds === "number" ? { seconds: it.seconds } : null),
      ...(it.daypart ? { daypart: it.daypart } : null),
    })),
    photos: pack.photos,
  };
}

export function getPack(id: string): SignagePack | null {
  return SIGNAGE_PACKS.find((p) => p.id === id) ?? null;
}

export function listPackSummaries(): {
  id: string;
  name: string;
  blurb: string;
  mode: "guest" | "vacant";
  blocks: number;
}[] {
  return SIGNAGE_PACKS.map((p) => ({
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    mode: p.mode,
    blocks: p.items.length,
  }));
}
