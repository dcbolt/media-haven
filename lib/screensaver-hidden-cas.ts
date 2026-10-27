/**
 * PostgREST-safe optimistic compare for orgs.settings (jsonb).
 * Plain .eq("settings", object) becomes settings=eq.[object Object] — broken.
 *
 * CAS uses settings::text on the **entire settings value as read** (F-2741) so
 * concurrent recordScan / requestDeviceReload writes conflict and retry instead
 * of being clobbered. PATCH URL size scales with full settings JSON (~qrScans +
 * hidden list + other keys); Hide is refused above a safe URL threshold; Unhide
 * that shrinks the list is always attempted (F-2742).
 *
 * Whole-settings round-trip via canonicalJsonbText may alter non-JSON-safe
 * numbers in other keys when read through JS (F-2745).
 */

import { sanitizeScreensaverHiddenUrlList } from "./screensaver-rotation-utils.ts";

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;

/**
 * Pre-flight limit for Hide only (Unhide that shrinks the list skips this).
 * Measures the PostgREST PATCH **URI query string** (id + settings::text CAS),
 * not the JSON body or headers. Cloudflare/proxies often cap URLs ~16 KiB; 12 KiB
 * leaves margin so we return app JSON 400 before a gateway 414/431.
 */
export const HIDDEN_URLS_PATCH_URL_SAFE_BYTES = 12 * 1024;

export const HIDDEN_URLS_TOO_MANY_MESSAGE =
  "Too many hidden items to save; unhide some or contact admin";

/** Match Postgres jsonb::text key order (sorted object keys, minimal JSON). */
export function canonicalJsonbText(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonbText(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonbText(obj[k])}`)
    .join(",")}}`;
}

export type SettingsCasFilter = {
  column: string;
  operator: string;
  value: string;
};

/** Whole-settings CAS filter — value must match row.settings as read (F-2743). */
export function settingsJsonbTextCasFilter(
  settingsAsRead: unknown
): SettingsCasFilter {
  return {
    column: "settings::text",
    operator: "eq",
    value: canonicalJsonbText(settingsAsRead),
  };
}

/** Approximate encoded PATCH query length (id + settings::text CAS filter). */
export function estimateSettingsPatchQueryBytes(
  orgId: string,
  settingsAsRead: unknown
): number {
  const cas = settingsJsonbTextCasFilter(settingsAsRead);
  const idPart = `id=eq.${encodeURIComponent(orgId)}`;
  const op = `${encodeURIComponent(cas.column)}=eq.${encodeURIComponent(cas.value)}`;
  return idPart.length + 1 + op.length;
}

function hiddenListFromSettings(settings: unknown): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [];
  }
  const raw = (settings as Record<string, unknown>)[SETTINGS_KEY];
  if (raw === null || raw === undefined) {
    return [];
  }
  return sanitizeScreensaverHiddenUrlList(raw);
}

function listsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

function hiddenListShrinks(current: string[], next: string[]): boolean {
  return next.length < current.length;
}

export type HiddenUrlsMutateFn = (current: string[]) => string[];

/**
 * Patch only `screensaverHiddenUrls` with optimistic whole-settings CAS.
 * Each attempt re-reads settings from the DB (never the 60s read cache) (F-2617).
 */
export async function patchHiddenUrlsMutate(
  orgId: string,
  mutate: HiddenUrlsMutateFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any } | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!db) return { ok: false, error: "no database" };

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { data: row, error: readErr } = await db
      .from("orgs")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message || "read failed" };
    if (!row) return { ok: false, error: "org missing — apply 0019" };

    const settingsAsRead = row.settings;
    const prev =
      settingsAsRead &&
      typeof settingsAsRead === "object" &&
      !Array.isArray(settingsAsRead)
        ? { ...(settingsAsRead as Record<string, unknown>) }
        : {};
    const currentList = hiddenListFromSettings(settingsAsRead);
    const nextList = sanitizeScreensaverHiddenUrlList(mutate(currentList));

    if (listsEqual(nextList, currentList)) {
      return { ok: true };
    }

    const nextSettings = { ...prev, [SETTINGS_KEY]: nextList };
    const shrinks = hiddenListShrinks(currentList, nextList);
    if (!shrinks) {
      const queryBytesNow = estimateSettingsPatchQueryBytes(orgId, settingsAsRead);
      const queryBytesNext = estimateSettingsPatchQueryBytes(orgId, nextSettings);
      if (
        Math.max(queryBytesNow, queryBytesNext) >
        HIDDEN_URLS_PATCH_URL_SAFE_BYTES
      ) {
        return { ok: false, error: HIDDEN_URLS_TOO_MANY_MESSAGE };
      }
    }
    const cas = settingsJsonbTextCasFilter(settingsAsRead);

    const { data: updated, error: writeErr } = await db
      .from("orgs")
      .update({ settings: nextSettings })
      .eq("id", orgId)
      .filter(cas.column, cas.operator, cas.value)
      .select("id");
    if (writeErr) {
      const msg = writeErr.message?.trim();
      return {
        ok: false,
        error: msg || HIDDEN_URLS_TOO_MANY_MESSAGE,
      };
    }
    if (updated && updated.length > 0) {
      return { ok: true };
    }
  }
  return { ok: false, error: "settings conflict — retry" };
}
