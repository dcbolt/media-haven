/**
 * S5.1 TV pair profiles — defaults applied when a host claims/links a device.
 *
 * Stored on Tenant Zero `orgs.settings.pairProfile` (no migration).
 * - deviceClass: streamer | signage (default coaching class until 0022 column)
 * - labelPrefix: used when autoLabel is on and device has no label
 * - autoLabel: set "Prefix · PropertyShort" on claim if label blank
 * - seedPlaylistIfEmpty: if property has no guest playlist, seed Beach pack
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";
import { getPack, packToPlaylist } from "./signage-packs";
import { playlistHistory, signagePlaylist } from "./tv";
import { signageName } from "./content";

export type DeviceClassDefault = "streamer" | "signage";

export type PairProfile = {
  deviceClass: DeviceClassDefault;
  /** e.g. "Living" → auto label "Living · Turtle" */
  labelPrefix: string;
  autoLabel: boolean;
  /** Seed tpl-beach onto property if settings.playlist is empty on claim. */
  seedPlaylistIfEmpty: boolean;
};

const DEFAULT_PROFILE: PairProfile = {
  deviceClass: "streamer",
  labelPrefix: "Living",
  autoLabel: true,
  seedPlaylistIfEmpty: false,
};

const MAX_PREFIX = 24;

export function sanitizePairProfile(raw: unknown): PairProfile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PROFILE };
  const o = raw as Record<string, unknown>;
  const dc = String(o.deviceClass ?? "streamer");
  return {
    deviceClass: dc === "signage" ? "signage" : "streamer",
    labelPrefix: String(o.labelPrefix ?? DEFAULT_PROFILE.labelPrefix)
      .trim()
      .slice(0, MAX_PREFIX) || DEFAULT_PROFILE.labelPrefix,
    autoLabel: o.autoLabel !== false,
    seedPlaylistIfEmpty: o.seedPlaylistIfEmpty === true,
  };
}

export async function loadPairProfile(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<PairProfile> {
  const db = supabaseAdmin();
  if (!db) return { ...DEFAULT_PROFILE };
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_PROFILE };
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  return sanitizePairProfile(settings.pairProfile);
}

export async function savePairProfile(
  input: Partial<PairProfile>,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; profile: PairProfile } | { ok: false; error: string }> {
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
  const merged = sanitizePairProfile({
    ...sanitizePairProfile(prev.pairProfile),
    ...input,
  });

  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, pairProfile: merged } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, profile: merged };
}

/**
 * After a successful link/claim: auto-label blank devices and optionally
 * seed a Beach playlist when the property has none.
 * Also stamps org settings.deviceClasses[deviceId] for future S3.6.
 */
export async function applyPairProfileOnClaim(opts: {
  deviceId: string;
  propertyId: string;
  orgId?: string;
}): Promise<void> {
  const db = supabaseAdmin();
  if (!db) return;
  const orgId = opts.orgId ?? FLORIDA_HAVENS_ORG_ID;
  const profile = await loadPairProfile(orgId);

  // Device class map (settings-only stand-in until MCP 0022 column).
  {
    const { data: orgRow } = await db
      .from("orgs")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (orgRow) {
      const prev =
        orgRow.settings && typeof orgRow.settings === "object"
          ? (orgRow.settings as Record<string, unknown>)
          : {};
      const classes =
        prev.deviceClasses &&
        typeof prev.deviceClasses === "object" &&
        !Array.isArray(prev.deviceClasses)
          ? { ...(prev.deviceClasses as Record<string, string>) }
          : {};
      classes[opts.deviceId] = profile.deviceClass;
      await db
        .from("orgs")
        .update({ settings: { ...prev, deviceClasses: classes } })
        .eq("id", orgId);
    }
  }

  // Auto-label if blank.
  if (profile.autoLabel) {
    const { data: device } = await db
      .from("tv_devices")
      .select("label")
      .eq("id", opts.deviceId)
      .maybeSingle();
    const existing = (device?.label as string | null)?.trim();
    if (!existing) {
      const { data: prop } = await db
        .from("properties")
        .select("name")
        .eq("id", opts.propertyId)
        .maybeSingle();
      const short = prop?.name
        ? signageName(prop.name as string).slice(0, 28)
        : "Haven";
      const prefix = profile.labelPrefix.trim() || "Living";
      const label = `${prefix} · ${short}`.slice(0, 60);
      await db.from("tv_devices").update({ label }).eq("id", opts.deviceId);
    }
  }

  // Seed guest playlist if empty and host opted in.
  if (profile.seedPlaylistIfEmpty) {
    const { data: prop } = await db
      .from("properties")
      .select("settings")
      .eq("id", opts.propertyId)
      .maybeSingle();
    if (!prop) return;
    const settings =
      prop.settings && typeof prop.settings === "object"
        ? (prop.settings as Record<string, unknown>)
        : {};
    if (signagePlaylist(settings.playlist)) return;
    const pack = getPack("tpl-beach");
    if (!pack) return;
    const playlist = packToPlaylist(pack);
    const history = playlistHistory(settings.playlistHistory);
    const at = new Date().toISOString();
    await db
      .from("properties")
      .update({
        settings: {
          ...settings,
          playlist,
          playlistHistory: [{ at, playlist }, ...history].slice(0, 10),
        },
      })
      .eq("id", opts.propertyId);
  }
}
