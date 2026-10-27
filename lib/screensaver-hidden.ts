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

async function writeHiddenUrls(
  urls: string[],
  orgId: string
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
  const nextSettings = {
    ...prev,
    [SETTINGS_KEY]: sanitizeScreensaverHiddenUrlList(urls),
  };
  const { error: writeErr } = await db
    .from("orgs")
    .update({ settings: nextSettings })
    .eq("id", orgId);
  if (writeErr) return { ok: false, error: writeErr.message };
  invalidateScreensaverHiddenCache();
  return { ok: true };
}

export async function hideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("http") || url.length > 2000) {
    return { ok: false, error: "bad url" };
  }
  const hidden = await loadScreensaverHiddenUrls(orgId);
  if (hidden.has(url)) return { ok: true };
  const next = [...hidden, url];
  return writeHiddenUrls(next, orgId);
}

export async function unhideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("http")) {
    return { ok: false, error: "bad url" };
  }
  const hidden = await loadScreensaverHiddenUrls(orgId);
  if (!hidden.has(url)) return { ok: true };
  const next = [...hidden].filter((u) => u !== url);
  return writeHiddenUrls(next, orgId);
}
