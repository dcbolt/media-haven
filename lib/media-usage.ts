/**
 * Where org media URLs appear in property playlists (published settings).
 */

export type MediaUsageRef = {
  propertyId: string;
  propertyName: string;
  playlist: "guest" | "vacant";
  published: boolean;
};

type PlaylistItem = { key: string; url?: string };
type SignagePlaylistLike = { items: PlaylistItem[]; photos?: boolean };

type PropertySettings = {
  playlist?: unknown;
  vacantPlaylist?: unknown;
} | null;

export type PropertyPlaylistRow = {
  id: string;
  name: string;
  settings?: PropertySettings;
};

/** Minimal playlist parse (Node-smoke safe — no lib/tv import). */
export function parsePropertyPlaylist(raw: unknown): SignagePlaylistLike | null {
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: PlaylistItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const key = String((it as { key?: unknown }).key ?? "").trim();
    if (!key) continue;
    const urlRaw = (it as { url?: unknown }).url;
    const url =
      typeof urlRaw === "string" && urlRaw.startsWith("http") ? urlRaw : undefined;
    out.push({ key, ...(url ? { url } : null) });
  }
  return { items: out, photos: Boolean((raw as { photos?: unknown }).photos) };
}

function urlsInPlaylist(pl: SignagePlaylistLike | null): string[] {
  if (!pl) return [];
  return pl.items.map((it) => it.url).filter((u): u is string => Boolean(u));
}

/** Map media URL → properties/timelines that reference it. */
export function buildMediaUsageIndex(
  properties: PropertyPlaylistRow[]
): Record<string, MediaUsageRef[]> {
  const out: Record<string, MediaUsageRef[]> = {};
  const push = (url: string, ref: MediaUsageRef) => {
    if (!out[url]) out[url] = [];
    if (
      !out[url].some(
        (r) => r.propertyId === ref.propertyId && r.playlist === ref.playlist
      )
    ) {
      out[url].push(ref);
    }
  };
  for (const p of properties) {
    const guest = parsePropertyPlaylist(p.settings?.playlist);
    const vacant = parsePropertyPlaylist(p.settings?.vacantPlaylist);
    for (const url of urlsInPlaylist(guest)) {
      push(url, {
        propertyId: p.id,
        propertyName: p.name,
        playlist: "guest",
        published: true,
      });
    }
    for (const url of urlsInPlaylist(vacant)) {
      push(url, {
        propertyId: p.id,
        propertyName: p.name,
        playlist: "vacant",
        published: true,
      });
    }
  }
  return out;
}

/** Strip URLs from every property playlist (guest + vacant). */
export function stripUrlsFromPlaylists(
  settings: Record<string, unknown>,
  urls: Set<string>
): { next: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const next = { ...settings };
  for (const key of ["playlist", "vacantPlaylist"] as const) {
    const pl = parsePropertyPlaylist(next[key]);
    if (!pl) continue;
    const items = pl.items.filter((it) => !it.url || !urls.has(it.url));
    if (items.length !== pl.items.length) {
      changed = true;
      next[key] = { ...pl, items };
    }
  }
  return { next, changed };
}
