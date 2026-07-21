/**
 * S1.1 calendar campaigns — date-ranged playlist overrides.
 *
 * Stored on Tenant Zero `orgs.settings.campaigns` (id → campaign).
 * No migration. TV precedence (document where hooked):
 *   emergency takeover > active campaign > settings.playlist > default
 *
 * Empty propertyIds = all properties. Inclusive date window on local
 * calendar days (YYYY-MM-DD).
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";
import { signagePlaylist, type SignagePlaylist } from "./tv";

export type Campaign = {
  id: string;
  name: string;
  /** Inclusive start date YYYY-MM-DD (host-local intent). */
  startDate: string;
  /** Inclusive end date YYYY-MM-DD. */
  endDate: string;
  playlist: SignagePlaylist;
  /** Empty = fleet-wide for all properties. */
  propertyIds: string[];
  setAt: string;
};

const MAX_CAMPAIGNS = 40;
const MAX_NAME = 48;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base || "campaign"}-${suffix}`;
}

/** Local YYYY-MM-DD for comparisons (campaign windows are calendar days). */
export function localDateYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sanitizeCampaign(raw: unknown): Campaign | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "")
    .trim()
    .slice(0, 64);
  const name = String(o.name ?? "")
    .trim()
    .slice(0, MAX_NAME);
  const startDate = String(o.startDate ?? "").trim();
  const endDate = String(o.endDate ?? "").trim();
  const playlist = signagePlaylist(o.playlist);
  if (!id || !name || !playlist) return null;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return null;
  if (endDate < startDate) return null;
  const propertyIds = Array.isArray(o.propertyIds)
    ? o.propertyIds
        .map((x) => String(x))
        .filter((x) => UUID_RE.test(x))
        .slice(0, 50)
    : [];
  const setAt = String(o.setAt ?? "").trim() || new Date(0).toISOString();
  return { id, name, startDate, endDate, playlist, propertyIds, setAt };
}

export function sanitizeCampaignsMap(raw: unknown): Record<string, Campaign> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Campaign> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CAMPAIGNS) break;
    const c = sanitizeCampaign(v);
    if (!c) continue;
    const id = c.id || k;
    out[id] = { ...c, id };
    n++;
  }
  return out;
}

export function campaignCoversProperty(
  c: Campaign,
  propertyId: string
): boolean {
  if (c.propertyIds.length === 0) return true;
  return c.propertyIds.includes(propertyId);
}

export function campaignIsActive(
  c: Campaign,
  onDate: string = localDateYmd()
): boolean {
  return onDate >= c.startDate && onDate <= c.endDate;
}

/**
 * Prefer the active campaign that ends soonest (tightest window), then
 * newest setAt. Null if none apply to this property today.
 */
export function pickActiveCampaign(
  campaigns: Campaign[],
  propertyId: string,
  onDate: string = localDateYmd()
): Campaign | null {
  const hits = campaigns.filter(
    (c) => campaignIsActive(c, onDate) && campaignCoversProperty(c, propertyId)
  );
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
    return b.setAt.localeCompare(a.setAt);
  });
  return hits[0] ?? null;
}

export async function loadCampaigns(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<Campaign[]> {
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
  const map = sanitizeCampaignsMap(settings.campaigns);
  return Object.values(map).sort((a, b) =>
    a.startDate === b.startDate
      ? a.name.localeCompare(b.name)
      : a.startDate.localeCompare(b.startDate)
  );
}

export async function saveCampaign(
  input: {
    name: string;
    startDate: string;
    endDate: string;
    playlist: unknown;
    propertyIds?: string[];
    id?: string;
  },
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; campaign: Campaign } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, MAX_NAME);
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();
  const playlist = signagePlaylist(input.playlist);
  if (!name) return { ok: false, error: "name required" };
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { ok: false, error: "start/end must be YYYY-MM-DD" };
  }
  if (endDate < startDate) {
    return { ok: false, error: "end date must be on or after start" };
  }
  if (!playlist) {
    return { ok: false, error: "playlist needs at least one valid block" };
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
  const map = sanitizeCampaignsMap(prev.campaigns);
  const id = (input.id && map[input.id] ? input.id : slugId(name)).slice(0, 64);
  if (!map[id] && Object.keys(map).length >= MAX_CAMPAIGNS) {
    return { ok: false, error: `max ${MAX_CAMPAIGNS} campaigns` };
  }

  const propertyIds = (input.propertyIds ?? map[id]?.propertyIds ?? [])
    .filter((x) => UUID_RE.test(x))
    .slice(0, 50);

  const campaign: Campaign = {
    id,
    name,
    startDate,
    endDate,
    playlist,
    propertyIds,
    setAt: new Date().toISOString(),
  };
  map[id] = campaign;

  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, campaigns: map } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, campaign };
}

export async function deleteCampaign(
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
  const map = sanitizeCampaignsMap(prev.campaigns);
  if (!map[id]) return { ok: false, error: "campaign not found" };
  delete map[id];
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, campaigns: map } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}
