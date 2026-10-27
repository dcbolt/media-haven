/**
 * PostgREST-safe optimistic compare for orgs.settings.screensaverHiddenUrls.
 * CAS filters only the hidden-url subkey (not settings::text) so qrScans/mediaMeta
 * growth cannot blow the PATCH URL past Cloudflare limits (F-2666, F-2695, F-2696).
 */

import {
  MAX_SCREENSAVER_HIDDEN_URLS,
  sanitizeScreensaverHiddenUrlList,
} from "./screensaver-rotation-utils.ts";

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;

/** Stay under ~16 KB URL limits (Cloudflare); fail closed with a clear 4xx message. */
export const HIDDEN_URLS_PATCH_URL_SAFE_BYTES = 12 * 1024;

export const HIDDEN_URLS_TOO_MANY_MESSAGE =
  "Too many hidden items to save; unhide some or contact admin";

export const HIDDEN_URLS_LIST_CAP_MESSAGE = `Hidden rotation limit (${MAX_SCREENSAVER_HIDDEN_URLS}) reached; unhide some first.`;

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

/** Canonical hidden list for CAS (F-2662): sorted, sanitized, JSON.stringify. */
export function canonicalHiddenUrlsJson(list: string[]): string {
  return JSON.stringify(
    sanitizeScreensaverHiddenUrlList([...list].sort((a, b) => a.localeCompare(b)))
  );
}

export type SettingsCasFilter = {
  column: string;
  operator: string;
  value: string;
};

const HIDDEN_CAS_COLUMN = "settings->screensaverHiddenUrls";

/** @deprecated Whole-settings CAS — blows URL size; use hiddenUrlsSubkeyCasFilter. */
export function settingsJsonbTextCasFilter(
  settings: unknown
): SettingsCasFilter {
  return {
    column: "settings::text",
    operator: "eq",
    value: canonicalJsonbText(settings),
  };
}

export function hiddenUrlsSubkeyCasFilter(
  settings: unknown,
  currentList: string[]
): SettingsCasFilter {
  const list = sanitizeScreensaverHiddenUrlList(currentList);
  const canonical = canonicalHiddenUrlsJson(list);
  const hasKey =
    settings &&
    typeof settings === "object" &&
    !Array.isArray(settings) &&
    Object.prototype.hasOwnProperty.call(settings, SETTINGS_KEY);
  if (list.length === 0 && !hasKey) {
    return { column: HIDDEN_CAS_COLUMN, operator: "is", value: "null" };
  }
  return { column: HIDDEN_CAS_COLUMN, operator: "eq", value: canonical };
}

/** Approximate encoded PATCH query length (id + CAS filter only). */
export function estimateHiddenUrlsPatchQueryBytes(
  orgId: string,
  cas: SettingsCasFilter
): number {
  const idPart = `id=eq.${encodeURIComponent(orgId)}`;
  const op =
    cas.operator === "is"
      ? `${encodeURIComponent(cas.column)}=is.${cas.value}`
      : `${encodeURIComponent(cas.column)}=eq.${encodeURIComponent(cas.value)}`;
  return idPart.length + 1 + op.length;
}

function hiddenListFromSettings(settings: unknown): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [];
  }
  return sanitizeScreensaverHiddenUrlList(
    (settings as Record<string, unknown>)[SETTINGS_KEY]
  );
}

function sortedHiddenList(list: string[]): string[] {
  return sanitizeScreensaverHiddenUrlList(list).sort((a, b) =>
    a.localeCompare(b)
  );
}

export type HiddenUrlsMutateFn = (current: string[]) => string[];

/**
 * Patch only `screensaverHiddenUrls` with optimistic subkey CAS.
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

    const prev =
      row.settings && typeof row.settings === "object"
        ? (row.settings as Record<string, unknown>)
        : {};
    const currentList = hiddenListFromSettings(row.settings);
    const mutated = mutate(currentList);
    if (mutated.length > MAX_SCREENSAVER_HIDDEN_URLS) {
      return { ok: false, error: HIDDEN_URLS_LIST_CAP_MESSAGE };
    }
    const nextList = sortedHiddenList(mutated);

    const currentSorted = sortedHiddenList(currentList);
    if (
      nextList.length === currentSorted.length &&
      nextList.every((u, i) => u === currentSorted[i])
    ) {
      return { ok: true };
    }

    const cas = hiddenUrlsSubkeyCasFilter(row.settings, currentList);
    const queryBytes = estimateHiddenUrlsPatchQueryBytes(orgId, cas);
    if (queryBytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES) {
      return { ok: false, error: HIDDEN_URLS_TOO_MANY_MESSAGE };
    }

    const nextSettings = { ...prev, [SETTINGS_KEY]: nextList };

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
