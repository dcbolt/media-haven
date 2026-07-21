/**
 * S2.1 media library metadata — tags, title, expiry.
 *
 * Stored on Tenant Zero org settings (`orgs.settings.mediaMeta`) keyed by
 * asset URL so Drive/Blob/listing photos share one catalog without a new
 * table. Phase A: always scoped via getFloridaHavensOrgId(). Multi-tenant
 * later: same shape on each org's settings.
 *
 * Expired assets (expiresAt <= now) are silent-retired from the signage
 * media pool; the host can still find them via "Show expired".
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";

export type MediaMetaEntry = {
  title?: string;
  tags: string[];
  /** ISO date (YYYY-MM-DD) or full ISO datetime; null/omit = no expiry */
  expiresAt?: string | null;
  /** S1.2 validity start — hidden from TV rotations before this. */
  startsAt?: string | null;
};

/** url → meta */
export type MediaMetaMap = Record<string, MediaMetaEntry>;

const MAX_TAGS = 12;
const MAX_TAG_LEN = 32;
const MAX_TITLE = 80;
const MAX_ENTRIES = 2000;

function sanitizeTag(raw: unknown): string | null {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, "")
    .slice(0, MAX_TAG_LEN)
    .trim();
  return t || null;
}

function sanitizeExpires(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  // Accept YYYY-MM-DD or full ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = Date.parse(s);
  if (!Number.isFinite(d)) return null;
  return new Date(d).toISOString();
}

/** Sanitize one meta entry (bad fields dropped, never throws). */
export function sanitizeMediaMetaEntry(raw: unknown): MediaMetaEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tags = Array.isArray(o.tags)
    ? [
        ...new Set(
          o.tags
            .map(sanitizeTag)
            .filter((t): t is string => Boolean(t))
            .slice(0, MAX_TAGS)
        ),
      ]
    : [];
  const titleRaw = o.title != null ? String(o.title).trim().slice(0, MAX_TITLE) : "";
  const expiresAt = sanitizeExpires(o.expiresAt);
  const startsAt = sanitizeExpires(o.startsAt);
  if (!titleRaw && tags.length === 0 && !expiresAt && !startsAt) {
    // Empty meta — treat as delete
    return { tags: [] };
  }
  const out: MediaMetaEntry = { tags };
  if (titleRaw) out.title = titleRaw;
  if (expiresAt) out.expiresAt = expiresAt;
  if (startsAt) out.startsAt = startsAt;
  return out;
}

/** Sanitize a full mediaMeta map from org settings. */
export function sanitizeMediaMetaMap(raw: unknown): MediaMetaMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MediaMetaMap = {};
  let n = 0;
  for (const [url, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_ENTRIES) break;
    if (typeof url !== "string" || !url.startsWith("http")) continue;
    const e = sanitizeMediaMetaEntry(entry);
    if (!e) continue;
    // Keep entries that still have useful fields (or explicit empty tags after clear)
    if (e.title || e.tags.length > 0 || e.expiresAt || e.startsAt) {
      out[url] = e;
      n++;
    }
  }
  return out;
}

/** True if expiresAt is set and is at/before now (end of day for date-only). */
export function isMediaExpired(
  expiresAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!expiresAt) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    // End of local calendar day in UTC terms: treat date as UTC end-of-day
    const end = Date.parse(`${expiresAt}T23:59:59.999Z`);
    return Number.isFinite(end) && end < now;
  }
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}

/** S1.2: true if startsAt is set and still in the future (date-only =
 *  start of that UTC day). Not-yet-started media stays arrangeable in the
 *  editor but is skipped by TV rotations. */
export function isMediaNotStarted(
  startsAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!startsAt) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) {
    const begin = Date.parse(`${startsAt}T00:00:00.000Z`);
    return Number.isFinite(begin) && begin > now;
  }
  const t = Date.parse(startsAt);
  return Number.isFinite(t) && t > now;
}

/** Valid for playback right now: started (or no start) and not expired. */
export function isMediaCurrentlyValid(
  entry: MediaMetaEntry | undefined,
  now = Date.now()
): boolean {
  if (!entry) return true;
  return (
    !isMediaExpired(entry.expiresAt, now) &&
    !isMediaNotStarted(entry.startsAt, now)
  );
}

/** Load mediaMeta map for Tenant Zero (or empty if DB/migration missing). */
export async function loadMediaMeta(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<MediaMetaMap> {
  const db = supabaseAdmin();
  if (!db) return {};
  const { data, error } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return {};
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  return sanitizeMediaMetaMap(settings.mediaMeta);
}

/**
 * Upsert one URL's meta into org settings.mediaMeta (merge).
 * Pass empty tags + no title + no expiresAt to delete the entry.
 */
export async function upsertMediaMeta(
  url: string,
  patch: {
    title?: string | null;
    tags?: string[];
    expiresAt?: string | null;
    startsAt?: string | null;
  },
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; entry: MediaMetaEntry | null } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("http") || url.length > 2000) {
    return { ok: false, error: "bad url" };
  }
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const { data: row, error: readErr } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "org missing — apply 0019" };

  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const map = sanitizeMediaMetaMap(prev.mediaMeta);

  const merged: Record<string, unknown> = {
    ...(map[url] ?? { tags: [] }),
    ...patch,
  };
  // Normalize nulls from client
  if (patch.title === null) delete merged.title;
  if (patch.expiresAt === null) delete merged.expiresAt;
  if (patch.startsAt === null) delete merged.startsAt;
  if (patch.tags) merged.tags = patch.tags;

  const entry = sanitizeMediaMetaEntry(merged);
  if (
    !entry ||
    (!entry.title && entry.tags.length === 0 && !entry.expiresAt && !entry.startsAt)
  ) {
    delete map[url];
  } else {
    map[url] = entry;
  }

  const nextSettings = { ...prev, mediaMeta: map };
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: nextSettings })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };

  return { ok: true, entry: map[url] ?? null };
}

/** Unique sorted tags across the catalog (for filter chips). */
export function allTags(map: MediaMetaMap): string[] {
  const set = new Set<string>();
  for (const e of Object.values(map)) {
    for (const t of e.tags) set.add(t);
  }
  return [...set].sort();
}
