/**
 * S0.3b host force-reload for Fully Kiosk TVs.
 *
 * DB hands-off: 0020 tv_commands.action only allows 'launch_app', so we do
 * NOT add a reload action to that table. Instead:
 *   orgs.settings.deviceReloads[deviceId] = { at: ISO }
 * Each TV poll reads its stamp; client reloads once (sessionStorage guard)
 * when `at` is newer than the last handled stamp and still fresh.
 */

import { FLORIDA_HAVENS_ORG_ID } from "./org";
import { supabaseAdmin } from "./supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ignore reload stamps older than this (host fat-finger / stale). */
export const RELOAD_FRESH_MS = 5 * 60_000;

type ReloadMap = Record<string, { at: string }>;

function sanitizeMap(raw: unknown): ReloadMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ReloadMap = {};
  const now = Date.now();
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!UUID_RE.test(id)) continue;
    if (!v || typeof v !== "object") continue;
    const at = String((v as { at?: unknown }).at ?? "").trim();
    if (!Number.isFinite(Date.parse(at))) continue;
    // Drop ancient entries so org settings doesn't grow forever.
    if (now - Date.parse(at) > 24 * 3600_000) continue;
    out[id] = { at };
  }
  return out;
}

/**
 * Host requested a kiosk reload for this device. Returns the ISO stamp
 * if it is still fresh, else null.
 */
export async function getDeviceReloadAt(
  deviceId: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<string | null> {
  if (!UUID_RE.test(deviceId)) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return null;
  const settings =
    data.settings && typeof data.settings === "object"
      ? (data.settings as Record<string, unknown>)
      : {};
  const map = sanitizeMap(settings.deviceReloads);
  const at = map[deviceId]?.at;
  if (!at) return null;
  if (Date.now() - Date.parse(at) > RELOAD_FRESH_MS) return null;
  return at;
}

/** Host fleet map: stamp a per-device reload request (settings only). */
export async function requestDeviceReload(
  deviceId: string,
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<{ ok: true; at: string } | { ok: false; error: string }> {
  if (!UUID_RE.test(deviceId)) return { ok: false, error: "bad device id" };
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
  const map = sanitizeMap(prev.deviceReloads);
  const at = new Date().toISOString();
  map[deviceId] = { at };

  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: { ...prev, deviceReloads: map } })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  return { ok: true, at };
}
