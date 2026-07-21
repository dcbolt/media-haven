/**
 * S0.3 now-playing proxy for the host fleet map.
 *
 * What the property's TVs *should* be showing — mode + playlist/timeline
 * summary — without pixel capture (S4.6: never spy on occupied rooms).
 * Pure settings + occupancy + active takeover; no device write-backs.
 * Poll-friendly: one properties.settings batch per page load.
 */

import { signagePlaylist } from "./tv";
import { loadEmergencyTakeover, type EmergencyTakeover } from "./takeover";
import { supabaseAdmin } from "./supabase";

export type NowPlayingMode = "emergency" | "vacant" | "guest" | "unlinked";

export type NowPlaying = {
  mode: NowPlayingMode;
  /** Short line for the fleet card. */
  headline: string;
  /** Optional second line (timeline keys / media count). */
  detail: string | null;
};

const SLIDE_LABELS: Record<string, string> = {
  welcome: "Welcome",
  farewell: "Farewell",
  wifi: "Wi-Fi",
  "beach-day": "Beach day",
  "forecast-3": "3-day weather",
  "forecast-5": "5-day weather",
  "launch-board": "Rocket launches",
  "launch-today": "Launch today",
  streaming: "Entertainment",
  casting: "Casting",
  "book-direct": "Book direct",
  "sea-turtles": "Sea turtles",
  "our-havens": "Our Havens",
};

/** Device-local day-part (same windows as the TV client). */
export function daypartOf(d = new Date()): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

function labelForItem(it: {
  key: string;
  url?: string;
  mediaType?: "image" | "video";
}): string {
  if (it.url) return it.mediaType === "video" ? "Video" : "Photo";
  return SLIDE_LABELS[it.key] ?? it.key.replace(/-/g, " ");
}

/**
 * Summarize expected TV surface for one property. `occupied` null = unlinked.
 */
export function summarizeNowPlaying(args: {
  occupied: boolean | null;
  settings: unknown;
  takeover: EmergencyTakeover | null;
}): NowPlaying {
  if (args.occupied === null) {
    return { mode: "unlinked", headline: "Pairing code", detail: null };
  }

  if (args.takeover) {
    return {
      mode: "emergency",
      headline: `Emergency · ${args.takeover.title}`,
      detail:
        args.takeover.kind === "custom"
          ? "Custom takeover"
          : `${args.takeover.kind} alert`,
    };
  }

  const settings =
    args.settings && typeof args.settings === "object"
      ? (args.settings as Record<string, unknown>)
      : null;

  if (!args.occupied) {
    const vacant = signagePlaylist(settings?.vacantPlaylist);
    if (vacant?.items?.length) {
      const labels = vacant.items.slice(0, 4).map(labelForItem);
      return {
        mode: "vacant",
        headline: `Vacant playlist · ${vacant.items.length} block${
          vacant.items.length === 1 ? "" : "s"
        }`,
        detail: labels.join(" · ") || null,
      };
    }
    return {
      mode: "vacant",
      headline: "Vacant · standby ambience",
      detail: "Screensavers / property photos",
    };
  }

  const pl = signagePlaylist(settings?.playlist);
  const daypart = daypartOf();
  if (pl?.items?.length) {
    const active = pl.items.filter(
      (it) => !it.daypart || it.daypart === daypart
    );
    const labels = active.slice(0, 4).map(labelForItem);
    return {
      mode: "guest",
      headline: `Guest · ${active.length}-slide timeline (${daypart})`,
      detail: labels.join(" · ") || "Host timeline",
    };
  }

  return {
    mode: "guest",
    headline: "Guest · default rotation",
    detail: "Welcome · Wi-Fi · Beach · Rockets · Entertainment…",
  };
}

/**
 * Batch load now-playing for many property ids (one settings query + one
 * takeover read). Missing ids get no entry — callers treat that as unknown.
 */
export async function loadNowPlayingByProperty(
  propertyIds: string[]
): Promise<Map<string, { settings: unknown }>> {
  const out = new Map<string, { settings: unknown }>();
  const ids = [...new Set(propertyIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const db = supabaseAdmin();
  if (!db) return out;
  const { data } = await db
    .from("properties")
    .select("id, settings")
    .in("id", ids);
  for (const row of data ?? []) {
    out.set(row.id as string, { settings: row.settings });
  }
  return out;
}

/** Convenience for the fleet page: property settings map + active takeover. */
export async function loadFleetNowPlayingContext(propertyIds: string[]): Promise<{
  byProperty: Map<string, { settings: unknown }>;
  takeover: EmergencyTakeover | null;
}> {
  const [byProperty, takeover] = await Promise.all([
    loadNowPlayingByProperty(propertyIds),
    loadEmergencyTakeover(),
  ]);
  return { byProperty, takeover };
}
