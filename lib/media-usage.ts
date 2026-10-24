/**
 * Where org media URLs appear in property playlists (published settings).
 */

export type MediaUsagePlaylistKind =
  | "guest"
  | "vacant"
  | "guest-history"
  | "vacant-history"
  | "campaign";

export type MediaUsageRef = {
  propertyId: string;
  propertyName: string;
  playlist: MediaUsagePlaylistKind;
  published: boolean;
  /** History publish time or campaign id for disambiguation */
  detail?: string;
};

type PlaylistItem = { key: string; url?: string };
type SignagePlaylistLike = { items: PlaylistItem[]; photos?: boolean };

type PropertySettings = {
  playlist?: unknown;
  vacantPlaylist?: unknown;
  playlistHistory?: unknown;
  vacantPlaylistHistory?: unknown;
} | null;

export type PropertyPlaylistRow = {
  id: string;
  name: string;
  settings?: PropertySettings;
};

export type CampaignUsageRow = {
  id: string;
  name: string;
  playlist: unknown;
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

function pushUsage(
  out: Record<string, MediaUsageRef[]>,
  url: string,
  ref: MediaUsageRef
) {
  if (!out[url]) out[url] = [];
  if (
    !out[url].some(
      (r) =>
        r.propertyId === ref.propertyId &&
        r.playlist === ref.playlist &&
        r.detail === ref.detail
    )
  ) {
    out[url].push(ref);
  }
}

function indexPlaylistUrls(
  out: Record<string, MediaUsageRef[]>,
  pl: SignagePlaylistLike | null,
  refBase: Omit<MediaUsageRef, "playlist" | "published" | "detail"> & {
    playlist: MediaUsagePlaylistKind;
    published: boolean;
    detail?: string;
  }
) {
  for (const url of urlsInPlaylist(pl)) {
    pushUsage(out, url, {
      propertyId: refBase.propertyId,
      propertyName: refBase.propertyName,
      playlist: refBase.playlist,
      published: refBase.published,
      detail: refBase.detail,
    });
  }
}

function indexHistoryUrls(
  out: Record<string, MediaUsageRef[]>,
  raw: unknown,
  propertyId: string,
  propertyName: string,
  kind: "guest-history" | "vacant-history"
) {
  if (!Array.isArray(raw)) return;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const at = String((entry as { at?: unknown }).at ?? "").trim();
    const pl = parsePropertyPlaylist((entry as { playlist?: unknown }).playlist);
    indexPlaylistUrls(out, pl, {
      propertyId,
      propertyName,
      playlist: kind,
      published: false,
      detail: at || undefined,
    });
  }
}

/** Map media URL → properties/timelines/campaigns/history that reference it. */
export function buildMediaUsageIndex(
  properties: PropertyPlaylistRow[],
  campaigns: CampaignUsageRow[] = []
): Record<string, MediaUsageRef[]> {
  const out: Record<string, MediaUsageRef[]> = {};
  for (const p of properties) {
    const guest = parsePropertyPlaylist(p.settings?.playlist);
    const vacant = parsePropertyPlaylist(p.settings?.vacantPlaylist);
    indexPlaylistUrls(out, guest, {
      propertyId: p.id,
      propertyName: p.name,
      playlist: "guest",
      published: true,
    });
    indexPlaylistUrls(out, vacant, {
      propertyId: p.id,
      propertyName: p.name,
      playlist: "vacant",
      published: true,
    });
    indexHistoryUrls(
      out,
      p.settings?.playlistHistory,
      p.id,
      p.name,
      "guest-history"
    );
    indexHistoryUrls(
      out,
      p.settings?.vacantPlaylistHistory,
      p.id,
      p.name,
      "vacant-history"
    );
  }
  for (const c of campaigns) {
    const pl = parsePropertyPlaylist(c.playlist);
    indexPlaylistUrls(out, pl, {
      propertyId: c.id,
      propertyName: c.name,
      playlist: "campaign",
      published: true,
    });
  }
  return out;
}

/** Drop matching media URLs from a raw playlist object; preserve all other item fields. */
export function stripUrlsFromRawPlaylist(
  raw: unknown,
  urls: Set<string>
): { next: unknown; changed: boolean } {
  if (!raw || typeof raw !== "object") return { next: raw, changed: false };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return { next: raw, changed: false };
  const items = o.items.filter((it) => {
    if (!it || typeof it !== "object") return true;
    const url = (it as { url?: unknown }).url;
    return !(
      typeof url === "string" &&
      url.startsWith("http") &&
      urls.has(url)
    );
  });
  if (items.length === o.items.length) return { next: raw, changed: false };
  return { next: { ...o, items }, changed: true };
}

function stripUrlsFromHistory(
  raw: unknown,
  urls: Set<string>
): { next: unknown; changed: boolean } {
  if (!Array.isArray(raw)) return { next: raw, changed: false };
  let changed = false;
  const next = raw.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const e = entry as Record<string, unknown>;
    const { next: playlist, changed: plChanged } = stripUrlsFromRawPlaylist(
      e.playlist,
      urls
    );
    if (!plChanged) return entry;
    changed = true;
    return { ...e, playlist };
  });
  return { next, changed };
}

/** Strip URLs from guest/vacant playlists + publish history on one property.settings blob. */
export function stripUrlsFromPlaylists(
  settings: Record<string, unknown>,
  urls: Set<string>
): { next: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const next = { ...settings };
  for (const key of ["playlist", "vacantPlaylist"] as const) {
    const { next: pl, changed: c } = stripUrlsFromRawPlaylist(next[key], urls);
    if (c) {
      changed = true;
      next[key] = pl;
    }
  }
  for (const key of ["playlistHistory", "vacantPlaylistHistory"] as const) {
    const { next: hist, changed: c } = stripUrlsFromHistory(next[key], urls);
    if (c) {
      changed = true;
      next[key] = hist;
    }
  }
  return { next, changed };
}

/** Strip URLs from org.settings.campaigns playlists (id → campaign). */
export function stripUrlsFromCampaignsMap(
  campaignsRaw: unknown,
  urls: Set<string>
): { next: unknown; changed: boolean } {
  if (!campaignsRaw || typeof campaignsRaw !== "object" || Array.isArray(campaignsRaw)) {
    return { next: campaignsRaw, changed: false };
  }
  let changed = false;
  const map = campaignsRaw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...map };
  for (const [id, raw] of Object.entries(map)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const { next: playlist, changed: rowChanged } = stripUrlsFromRawPlaylist(
      row.playlist,
      urls
    );
    if (rowChanged) {
      changed = true;
      next[id] = { ...row, playlist };
    }
  }
  return { next, changed };
}

/** Human-readable line for host UI. */
export function formatMediaUsageRef(r: MediaUsageRef): string {
  if (r.playlist === "campaign") return `${r.propertyName} · campaign`;
  if (r.playlist === "guest-history") {
    return `${r.propertyName} · guest history${r.detail ? ` (${r.detail.slice(0, 10)})` : ""}`;
  }
  if (r.playlist === "vacant-history") {
    return `${r.propertyName} · vacant history${r.detail ? ` (${r.detail.slice(0, 10)})` : ""}`;
  }
  return `${r.propertyName} · ${r.playlist} playlist`;
}
