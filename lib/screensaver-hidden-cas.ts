/**
 * PostgREST-safe optimistic compare for orgs.settings (jsonb).
 * Plain .eq("settings", object) becomes settings=eq.[object Object] — broken.
 */

import { sanitizeScreensaverHiddenUrlList } from "./screensaver-rotation-utils.ts";

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;

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

export function settingsJsonbTextCasFilter(
  settings: unknown
): SettingsCasFilter {
  return {
    column: "settings::text",
    operator: "eq",
    value: canonicalJsonbText(settings),
  };
}

function hiddenListFromSettings(settings: unknown): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return [];
  }
  return sanitizeScreensaverHiddenUrlList(
    (settings as Record<string, unknown>)[SETTINGS_KEY]
  );
}

export type HiddenUrlsMutateFn = (current: string[]) => string[];

/**
 * Patch only `screensaverHiddenUrls` with optimistic settings::text CAS (F-2615).
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
    if (readErr) return { ok: false, error: readErr.message };
    if (!row) return { ok: false, error: "org missing — apply 0019" };

    const prev =
      row.settings && typeof row.settings === "object"
        ? (row.settings as Record<string, unknown>)
        : {};
    const currentList = hiddenListFromSettings(row.settings);
    const nextList = sanitizeScreensaverHiddenUrlList(mutate(currentList));

    if (
      nextList.length === currentList.length &&
      nextList.every((u, i) => u === currentList[i])
    ) {
      return { ok: true };
    }

    const nextSettings = { ...prev, [SETTINGS_KEY]: nextList };
    const cas = settingsJsonbTextCasFilter(row.settings);

    const { data: updated, error: writeErr } = await db
      .from("orgs")
      .update({ settings: nextSettings })
      .eq("id", orgId)
      .filter(cas.column, cas.operator, cas.value)
      .select("id");
    if (writeErr) return { ok: false, error: writeErr.message };
    if (updated && updated.length > 0) {
      return { ok: true };
    }
  }
  return { ok: false, error: "settings conflict — retry" };
}
