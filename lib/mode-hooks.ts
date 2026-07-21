/**
 * S5.4 mode transition hooks — auto-apply a channel when occupancy flips.
 *
 * Org settings `modeHooks` (no migration):
 *   enabled, checkInChannelId → guest playlist on vacant→guest / new stay
 *   vacantChannelId → vacant playlist on guest→vacant
 *
 * Property settings `modeHookState` tracks last observed mode + stayId so we
 * only fire on edges (never re-apply mid-stay). First observation bootstraps
 * state without rewriting playlists — hosts keep existing content until a
 * real transition.
 *
 * Locks: campaigns / takeover still outrank guest playlist at poll time.
 * DB hands-off. Reuses channel playlists + publish history shape.
 */

import { getChannel } from "./channels";
import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { playlistHistory, signagePlaylist, type SignagePlaylist } from "./tv";
import { supabaseAdmin } from "./supabase";

export type ModeHooks = {
  enabled: boolean;
  /** Channel applied to guest playlist when a stay becomes in-house. */
  checkInChannelId: string | null;
  /** Channel applied to vacant playlist when the property becomes empty. */
  vacantChannelId: string | null;
};

export type ModeHookState = {
  mode: "guest" | "vacant";
  stayId: string | null;
  lastAppliedAt: string | null;
  lastEvent: "check_in" | "vacant" | "bootstrap" | null;
};

const DEFAULT_HOOKS: ModeHooks = {
  enabled: false,
  checkInChannelId: null,
  vacantChannelId: null,
};

const HISTORY_MAX = 10;

function channelIdOrNull(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, 64);
  return s || null;
}

export function sanitizeModeHooks(raw: unknown): ModeHooks {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HOOKS };
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    checkInChannelId: channelIdOrNull(o.checkInChannelId),
    vacantChannelId: channelIdOrNull(o.vacantChannelId),
  };
}

export function sanitizeModeHookState(raw: unknown): ModeHookState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "guest" || o.mode === "vacant" ? o.mode : null;
  if (!mode) return null;
  const event = o.lastEvent;
  const lastEvent =
    event === "check_in" || event === "vacant" || event === "bootstrap"
      ? event
      : null;
  return {
    mode,
    stayId: channelIdOrNull(o.stayId),
    lastAppliedAt: channelIdOrNull(o.lastAppliedAt),
    lastEvent,
  };
}

export async function loadModeHooks(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<ModeHooks> {
  const db = supabaseAdmin();
  if (!db) return { ...DEFAULT_HOOKS };
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_HOOKS };
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  return sanitizeModeHooks(settings.modeHooks);
}

export async function saveModeHooks(
  input: Partial<ModeHooks>,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; hooks: ModeHooks } | { ok: false; error: string }> {
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
  const merged = sanitizeModeHooks({
    ...sanitizeModeHooks(prev.modeHooks),
    ...input,
  });

  // Drop channel refs that no longer exist so host UI doesn't look stuck.
  if (merged.checkInChannelId) {
    const ch = await getChannel(merged.checkInChannelId, orgId);
    if (!ch) merged.checkInChannelId = null;
  }
  if (merged.vacantChannelId) {
    const ch = await getChannel(merged.vacantChannelId, orgId);
    if (!ch) merged.vacantChannelId = null;
  }

  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, modeHooks: merged } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, hooks: merged };
}

async function applyChannelToProperty(opts: {
  propertyId: string;
  channelId: string;
  vacant: boolean;
  orgId: string;
}): Promise<boolean> {
  const channel = await getChannel(opts.channelId, opts.orgId);
  if (!channel) return false;
  const playlist = signagePlaylist(channel.playlist) as SignagePlaylist | null;
  if (!playlist) return false;

  const db = supabaseAdmin();
  if (!db) return false;
  const { data: row } = await db
    .from("properties")
    .select("settings")
    .eq("id", opts.propertyId)
    .maybeSingle();
  if (!row) return false;
  const s =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const playlistKey = opts.vacant ? "vacantPlaylist" : "playlist";
  const historyKey = opts.vacant ? "vacantPlaylistHistory" : "playlistHistory";
  const h = playlistHistory(s[historyKey]);
  const at = new Date().toISOString();
  const { error } = await db
    .from("properties")
    .update({
      settings: {
        ...s,
        [playlistKey]: playlist,
        [historyKey]: [{ at, playlist }, ...h].slice(0, HISTORY_MAX),
      },
    })
    .eq("id", opts.propertyId);
  return !error;
}

async function writeModeHookState(
  propertyId: string,
  state: ModeHookState
): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  const { data: row } = await db
    .from("properties")
    .select("settings")
    .eq("id", propertyId)
    .maybeSingle();
  if (!row) return;
  const s =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  await db
    .from("properties")
    .update({ settings: { ...s, modeHookState: state } })
    .eq("id", propertyId);
}

/**
 * Edge-only apply. Safe to call from every TV poll:
 * - disabled hooks → no-op
 * - first observation → bootstrap state, no playlist write
 * - same mode + same stay → no-op (no mid-stay surprise)
 * - vacant→guest or new stayId → optional check-in channel → guest playlist
 * - guest→vacant → optional vacant channel → vacantPlaylist
 *
 * Returns true when a playlist was rewritten (caller should re-read settings).
 */
export async function maybeApplyModeHooks(opts: {
  propertyId: string;
  occupied: boolean;
  stayId: string | null;
  propertySettings: Record<string, unknown> | null | undefined;
  orgId?: string;
}): Promise<{ applied: boolean; event: ModeHookState["lastEvent"] }> {
  const orgId = opts.orgId ?? FLORIDA_HAVENS_ORG_ID;
  const hooks = await loadModeHooks(orgId);
  if (!hooks.enabled) {
    return { applied: false, event: null };
  }

  const currentMode: "guest" | "vacant" = opts.occupied ? "guest" : "vacant";
  const prev = sanitizeModeHookState(opts.propertySettings?.modeHookState);
  const now = new Date().toISOString();

  // Bootstrap: record reality, never rewrite. Avoids stomping host playlists
  // the first time hooks are enabled on a fleet that is mid-stay.
  if (!prev) {
    await writeModeHookState(opts.propertyId, {
      mode: currentMode,
      stayId: opts.occupied ? opts.stayId : null,
      lastAppliedAt: now,
      lastEvent: "bootstrap",
    });
    return { applied: false, event: "bootstrap" };
  }

  const newStay =
    opts.occupied &&
    opts.stayId &&
    prev.mode === "guest" &&
    prev.stayId &&
    prev.stayId !== opts.stayId;

  const toGuest =
    opts.occupied && (prev.mode === "vacant" || newStay);
  const toVacant = !opts.occupied && prev.mode === "guest";

  if (!toGuest && !toVacant) {
    // Occupied with same stay, or still vacant — nothing to do.
    // Keep stayId filled if we only had bootstrap without stay id.
    if (
      opts.occupied &&
      opts.stayId &&
      prev.mode === "guest" &&
      prev.stayId !== opts.stayId
    ) {
      // Unreachable if newStay handled; left as safety no-op.
    }
    return { applied: false, event: null };
  }

  let applied = false;
  let event: ModeHookState["lastEvent"] = null;

  if (toGuest && hooks.checkInChannelId) {
    applied = await applyChannelToProperty({
      propertyId: opts.propertyId,
      channelId: hooks.checkInChannelId,
      vacant: false,
      orgId,
    });
    event = "check_in";
  } else if (toGuest) {
    event = "check_in"; // transition recorded even if no channel mapped
  }

  if (toVacant && hooks.vacantChannelId) {
    applied = await applyChannelToProperty({
      propertyId: opts.propertyId,
      channelId: hooks.vacantChannelId,
      vacant: true,
      orgId,
    });
    event = "vacant";
  } else if (toVacant) {
    event = "vacant";
  }

  // If apply rewrote settings, re-read before stamping state so we don't
  // clobber the new playlist with a stale settings merge.
  if (applied) {
    await writeModeHookState(opts.propertyId, {
      mode: currentMode,
      stayId: opts.occupied ? opts.stayId : null,
      lastAppliedAt: now,
      lastEvent: event,
    });
  } else {
    await writeModeHookState(opts.propertyId, {
      mode: currentMode,
      stayId: opts.occupied ? opts.stayId : null,
      lastAppliedAt: now,
      lastEvent: event,
    });
  }

  return { applied, event };
}
