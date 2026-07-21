/**
 * S1.5 playlist channels — named playlist packs (Beach / Rockets / Farewell).
 *
 * Stored on Tenant Zero `orgs.settings.channels` (id → channel). No migration.
 * Apply reuses POST /api/host/signage publish fan-out (S0.5) — do not invent a
 * parallel write path.
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";
import { signagePlaylist, type SignagePlaylist } from "./tv";

export type Channel = {
  id: string;
  name: string;
  playlist: SignagePlaylist;
  /** Optional default targets; empty = host chooses at apply time. */
  propertyIds: string[];
  setAt: string;
};

const MAX_CHANNELS = 40;
const MAX_NAME = 48;

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base || "channel"}-${suffix}`;
}

export function sanitizeChannel(raw: unknown): Channel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "")
    .trim()
    .slice(0, 64);
  const name = String(o.name ?? "")
    .trim()
    .slice(0, MAX_NAME);
  const playlist = signagePlaylist(o.playlist);
  if (!id || !name || !playlist) return null;
  const propertyIds = Array.isArray(o.propertyIds)
    ? o.propertyIds
        .map((x) => String(x))
        .filter((x) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            x
          )
        )
        .slice(0, 50)
    : [];
  const setAt = String(o.setAt ?? "").trim() || new Date(0).toISOString();
  return { id, name, playlist, propertyIds, setAt };
}

export function sanitizeChannelsMap(raw: unknown): Record<string, Channel> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Channel> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CHANNELS) break;
    const c = sanitizeChannel(v);
    if (!c) continue;
    // Prefer map key if valid, else channel id
    const id = c.id || k;
    out[id] = { ...c, id };
    n++;
  }
  return out;
}

export async function loadChannels(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<Channel[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data) return [];
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const map = sanitizeChannelsMap(settings.channels);
  return Object.values(map).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

export async function saveChannel(
  input: {
    name: string;
    playlist: unknown;
    propertyIds?: string[];
    /** Update existing if provided. */
    id?: string;
  },
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; channel: Channel } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, MAX_NAME);
  const playlist = signagePlaylist(input.playlist);
  if (!name) return { ok: false, error: "name required" };
  if (!playlist) return { ok: false, error: "playlist needs at least one valid block" };

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
  const map = sanitizeChannelsMap(prev.channels);
  const id = (input.id && map[input.id] ? input.id : slugId(name)).slice(0, 64);
  if (!map[id] && Object.keys(map).length >= MAX_CHANNELS) {
    return { ok: false, error: `max ${MAX_CHANNELS} channels` };
  }

  const channel: Channel = {
    id,
    name,
    playlist,
    propertyIds: (input.propertyIds ?? map[id]?.propertyIds ?? []).slice(0, 50),
    setAt: new Date().toISOString(),
  };
  map[id] = channel;

  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, channels: map } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, channel };
}

export async function deleteChannel(
  id: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };
  const { data: row, error: readErr } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "org missing" };
  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const map = sanitizeChannelsMap(prev.channels);
  if (!map[id]) return { ok: false, error: "channel not found" };
  delete map[id];
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, channels: map } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}

export async function getChannel(
  id: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<Channel | null> {
  const list = await loadChannels(orgId);
  return list.find((c) => c.id === id) ?? null;
}
