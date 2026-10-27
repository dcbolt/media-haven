/**
 * Google Drive (and other non-deletable) screensaver URLs hidden from TV
 * rotation. Persisted on Tenant Zero org settings — no new table.
 */

import { getFloridaHavensOrgId } from "./org.ts";
import {
  filterOutHiddenScreensavers,
  sanitizeScreensaverHiddenUrlList,
} from "./screensaver-rotation-utils.ts";
import { supabaseAdmin } from "./supabase.ts";

export { filterOutHiddenScreensavers } from "./screensaver-rotation-utils.ts";

const SETTINGS_KEY = "screensaverHiddenUrls";
const CACHE_TTL_MS = 60_000;
const MAX_WRITE_ATTEMPTS = 6;

let cache: { at: number; urls: Set<string> } | null = null;

export function invalidateScreensaverHiddenCache(): void {
  cache = null;
}

export async function loadScreensaverHiddenUrls(
  orgId: string = getFloridaHavensOrgId()
): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.urls;
  }
  const db = supabaseAdmin();
  if (!db) {
    cache = { at: Date.now(), urls: new Set() };
    return cache.urls;
  }
  const { data, error } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data?.settings || typeof data.settings !== "object") {
    cache = { at: Date.now(), urls: new Set() };
    return cache.urls;
  }
  const settings = data.settings as Record<string, unknown>;
  const urls = new Set(sanitizeScreensaverHiddenUrlList(settings[SETTINGS_KEY]));
  cache = { at: Date.now(), urls };
  return urls;
}

/**
 * Patch only `screensaverHiddenUrls` with optimistic jsonb equality (F-2539).
 */
async function patchHiddenUrlsAtomic(
  orgId: string,
  nextList: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const sanitized = sanitizeScreensaverHiddenUrlList(nextList);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
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
    const nextSettings = { ...prev, [SETTINGS_KEY]: sanitized };

    const { data: updated, error: writeErr } = await db
      .from("orgs")
      .update({ settings: nextSettings })
      .eq("id", orgId)
      .eq("settings", row.settings)
      .select("id");
    if (writeErr) return { ok: false, error: writeErr.message };
    if (updated && updated.length > 0) {
      invalidateScreensaverHiddenCache();
      return { ok: true };
    }
  }
  return { ok: false, error: "settings conflict — retry" };
}

export async function hideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("https://") || url.length > 2000) {
    return { ok: false, error: "bad url" };
  }
  const hidden = await loadScreensaverHiddenUrls(orgId);
  if (hidden.has(url)) return { ok: true };
  const next = [...hidden, url];
  return patchHiddenUrlsAtomic(orgId, next);
}

export async function unhideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return { ok: false, error: "bad url" };
  }
  const hidden = await loadScreensaverHiddenUrls(orgId);
  if (!hidden.has(url)) return { ok: true };
  const next = [...hidden].filter((u) => u !== url);
  return patchHiddenUrlsAtomic(orgId, next);
}
