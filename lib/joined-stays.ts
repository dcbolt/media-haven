/**
 * J1 joined stays — two Havens rented together as one listing.
 *
 * "The Havens at the Dunes" (Turtle + Shell) and "The Havens at Beach
 * Street" (Sea + Beach) are real Guesty listings, so they exist here as
 * ordinary property rows with their own sections, playlists, and synced
 * reservations. A joined-stay *group* on org settings maps the member
 * properties to that joined property row; while the group is active, every
 * TV paired to a member property serves the joined property's signage
 * (name, guest greeting, playlist, campaigns) — keeping the member house's
 * own Wi-Fi, since each building has its own network.
 *
 * Activation:
 *   auto — the joined property row has an in-house reservation (Guesty
 *          sync makes this hands-free once the row carries the joined
 *          listing's guesty_id)
 *   on   — host force-on (works before Guesty linkage, or for demos)
 *   off  — group disabled
 *
 * Shape lives on orgs.settings.joinedStays (no migration). Failure-safe:
 * any error resolves to "not joined" and the TV falls back to its own
 * property — never blank, never wrongly joined.
 */

import { ACTIVE_STAY_STATUSES } from "./guesty";
import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";

export type JoinedMode = "auto" | "on" | "off";

export type JoinedGroup = {
  /** Stable slug, e.g. "dunes", "beach-street". */
  key: string;
  /** Display name of the joined listing, e.g. "The Havens at the Dunes". */
  name: string;
  /** Property row that IS the joined listing (its content gets served). */
  joinedPropertyId: string;
  /** Member properties whose TVs flip while the group is active. */
  memberPropertyIds: string[];
  mode: JoinedMode;
};

const MAX_GROUPS = 12;
const MAX_MEMBERS = 8;
const MAX_NAME = 80;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeJoinedGroup(raw: unknown): JoinedGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = String(o.key ?? "").trim().toLowerCase();
  if (!KEY_RE.test(key)) return null;
  const name = String(o.name ?? "").trim().slice(0, MAX_NAME);
  if (!name) return null;
  const joinedPropertyId = String(o.joinedPropertyId ?? "").trim();
  if (!UUID_RE.test(joinedPropertyId)) return null;
  const memberPropertyIds = Array.isArray(o.memberPropertyIds)
    ? [
        ...new Set(
          o.memberPropertyIds
            .map((v) => String(v ?? "").trim())
            .filter((v) => UUID_RE.test(v) && v !== joinedPropertyId)
        ),
      ].slice(0, MAX_MEMBERS)
    : [];
  if (memberPropertyIds.length === 0) return null;
  const modeRaw = String(o.mode ?? "auto");
  const mode: JoinedMode =
    modeRaw === "on" || modeRaw === "off" ? modeRaw : "auto";
  return { key, name, joinedPropertyId, memberPropertyIds, mode };
}

export function sanitizeJoinedGroups(raw: unknown): JoinedGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: JoinedGroup[] = [];
  for (const item of raw) {
    if (out.length >= MAX_GROUPS) break;
    const g = sanitizeJoinedGroup(item);
    if (!g || seen.has(g.key)) continue;
    seen.add(g.key);
    out.push(g);
  }
  return out;
}

export async function loadJoinedGroups(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<JoinedGroup[]> {
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
  return sanitizeJoinedGroups(settings.joinedStays);
}

export async function saveJoinedGroups(
  groups: JoinedGroup[],
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
  if (!row) return { ok: false, error: "org missing — apply 0019" };
  const prev =
    row.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, joinedStays: sanitizeJoinedGroups(groups) } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true };
}

/** In-house reservation on a property right now (same window the TVs use). */
async function hasInHouseStay(propertyId: string): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return false;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("reservations")
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ACTIVE_STAY_STATUSES)
    .lte("check_in", now)
    .gte("check_out", now)
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

/** Whether a group is live right now, honoring its mode. */
export async function isGroupActive(group: JoinedGroup): Promise<boolean> {
  if (group.mode === "off") return false;
  if (group.mode === "on") return true;
  return hasInHouseStay(group.joinedPropertyId);
}

/**
 * The joined property a member's TV should serve instead of its own — or
 * null when no group covering this property is active. First active group
 * wins if a property somehow belongs to several.
 */
export async function resolveJoinedOverride(
  propertyId: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ group: JoinedGroup } | null> {
  try {
    const groups = await loadJoinedGroups(orgId);
    for (const group of groups) {
      if (!group.memberPropertyIds.includes(propertyId)) continue;
      if (await isGroupActive(group)) return { group };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * J1b nesting — the properties dashboard expresses groups by nesting a
 * property under its combined listing. Nesting under a parent creates the
 * parent's group on demand (mode auto) or joins it, after leaving any other
 * group; parentId null un-nests. Groups left with no members are dropped.
 */
export async function nestProperty(
  propertyId: string,
  parentId: string | null,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(propertyId)) return { ok: false, error: "bad property" };
  if (parentId === propertyId) {
    return { ok: false, error: "cannot nest a property under itself" };
  }
  const groups = await loadJoinedGroups(orgId);
  if (
    parentId &&
    groups.some((g) => g.joinedPropertyId === propertyId)
  ) {
    return {
      ok: false,
      error: "that property is itself a combined listing — un-nest its members first",
    };
  }

  const next = groups
    .map((g) => ({
      ...g,
      memberPropertyIds: g.memberPropertyIds.filter((id) => id !== propertyId),
    }))
    .filter((g) => g.memberPropertyIds.length > 0);

  if (parentId) {
    if (!UUID_RE.test(parentId)) return { ok: false, error: "bad parent" };
    const existing = next.find((g) => g.joinedPropertyId === parentId);
    if (existing) {
      existing.memberPropertyIds = [
        ...existing.memberPropertyIds,
        propertyId,
      ].slice(0, MAX_MEMBERS);
    } else {
      const db = supabaseAdmin();
      if (!db) return { ok: false, error: "no database" };
      const { data: parent } = await db
        .from("properties")
        .select("name, settings")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent) return { ok: false, error: "parent property not found" };
      const displayName = (
        parent.settings as { displayName?: string | null } | null
      )?.displayName;
      // Guesty names carry marketing tails ("… - 2 Heated Pools & Spas");
      // the group label wants just the listing name.
      const shortName = (displayName || String(parent.name))
        .split(" - ")[0]
        .trim()
        .slice(0, MAX_NAME);
      const key =
        shortName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || parentId.slice(0, 8);
      const group = sanitizeJoinedGroup({
        key,
        name: shortName,
        joinedPropertyId: parentId,
        memberPropertyIds: [propertyId],
        mode: "auto",
      });
      if (!group) return { ok: false, error: "could not build group" };
      next.push(group);
    }
  }

  return saveJoinedGroups(next, orgId);
}

export type JoinedGroupStatus = JoinedGroup & {
  active: boolean;
  /** Current in-house guest on the joined listing (auto detail for the UI). */
  guestLabel: string | null;
  checkOut: string | null;
};

/**
 * J3: Wi-Fi for each member house of a joined listing (portal dual cards).
 * Returns [] when this property is not a joined listing or members lack
 * wifi credentials. Never throws — portal falls back to the single row.
 */
export async function memberWifiForJoinedListing(
  joinedPropertyId: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ name: string; ssid: string; password: string }[]> {
  try {
    const groups = await loadJoinedGroups(orgId);
    const group = groups.find(
      (g) => g.joinedPropertyId === joinedPropertyId && g.mode !== "off"
    );
    if (!group) return [];
    const db = supabaseAdmin();
    if (!db) return [];
    const { data } = await db
      .from("properties")
      .select("id, name, wifi_ssid, wifi_password")
      .in("id", group.memberPropertyIds);
    if (!data?.length) return [];
    const byId = new Map(data.map((r) => [r.id as string, r]));
    // Preserve host-configured member order.
    const out: { name: string; ssid: string; password: string }[] = [];
    for (const mid of group.memberPropertyIds) {
      const row = byId.get(mid);
      if (!row) continue;
      const ssid = String(row.wifi_ssid ?? "").trim();
      const password = String(row.wifi_password ?? "").trim();
      if (!ssid || !password) continue;
      // Guesty names carry marketing tails; the card wants "Turtle Haven".
      const name =
        String(row.name ?? "").split(" - ")[0].trim() || "Haven";
      out.push({ name, ssid, password });
    }
    return out;
  } catch {
    return [];
  }
}

/** Group list with live activity for the host panel. */
export async function joinedGroupsStatus(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<JoinedGroupStatus[]> {
  const groups = await loadJoinedGroups(orgId);
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  return Promise.all(
    groups.map(async (group) => {
      let guestLabel: string | null = null;
      let checkOut: string | null = null;
      let staying = false;
      if (db) {
        const { data } = await db
          .from("reservations")
          .select("guest_first_name, check_out")
          .eq("property_id", group.joinedPropertyId)
          .in("status", ACTIVE_STAY_STATUSES)
          .lte("check_in", now)
          .gte("check_out", now)
          .order("check_in", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          staying = true;
          guestLabel = data.guest_first_name ?? null;
          checkOut = data.check_out ?? null;
        }
      }
      const active =
        group.mode === "on" || (group.mode === "auto" && staying);
      return { ...group, active, guestLabel, checkOut };
    })
  );
}
