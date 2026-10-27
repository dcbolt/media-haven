/**
 * Google Drive (and other non-deletable) screensaver URLs hidden from TV
 * rotation. Persisted on Tenant Zero org settings — no new table.
 */

import { getFloridaHavensOrgId } from "./org.ts";
import { patchHiddenUrlsMutate } from "./screensaver-hidden-cas.ts";
import {
  filterOutHiddenScreensavers,
  sanitizeScreensaverHiddenUrlList,
} from "./screensaver-rotation-utils.ts";
import { supabaseAdmin } from "./supabase.ts";

export { filterOutHiddenScreensavers } from "./screensaver-rotation-utils.ts";
export {
  canonicalJsonbText,
  estimateSettingsPatchQueryBytes,
  patchHiddenUrlsMutate,
  settingsJsonbTextCasFilter,
} from "./screensaver-hidden-cas.ts";

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

export async function hideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("https://") || url.length > 2000) {
    return { ok: false, error: "bad url" };
  }
  const result = await patchHiddenUrlsMutate(
    orgId,
    (current) => (current.includes(url) ? current : [...current, url]),
    supabaseAdmin()
  );
  if (result.ok) invalidateScreensaverHiddenCache();
  return result;
}

export async function unhideScreensaverUrl(
  url: string,
  orgId: string = getFloridaHavensOrgId()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof url !== "string" || !url.startsWith("https://")) {
    return { ok: false, error: "bad url" };
  }
  const result = await patchHiddenUrlsMutate(
    orgId,
    (current) => (current.includes(url) ? current.filter((u) => u !== url) : current),
    supabaseAdmin()
  );
  if (result.ok) invalidateScreensaverHiddenCache();
  return result;
}
