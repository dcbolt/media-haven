/**
 * Legacy whole-settings PostgREST CAS helpers (pre-0024 version column).
 */

import { sanitizeScreensaverHiddenUrlList } from "./screensaver-rotation-utils.ts";

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

export function settingsJsonbTextCasFilter(
  settingsAsRead: unknown
): SettingsCasFilter {
  return {
    column: "settings::text",
    operator: "eq",
    value: canonicalJsonbText(settingsAsRead),
  };
}

export function estimateSettingsPatchQueryBytes(
  orgId: string,
  settingsAsRead: unknown
): number {
  const cas = settingsJsonbTextCasFilter(settingsAsRead);
  const idPart = `id=eq.${encodeURIComponent(orgId)}`;
  const op = `${encodeURIComponent(cas.column)}=eq.${encodeURIComponent(cas.value)}`;
  return idPart.length + 1 + op.length;
}

const SETTINGS_KEY = "screensaverHiddenUrls";

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
