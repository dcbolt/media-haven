/**
 * Hide/Unhide screensaver URLs via orgs.settings CAS (version column or legacy).
 */

import {
  patchOrgSettingsMutate,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
} from "./org-settings-cas.ts";
import { sanitizeScreensaverHiddenUrlList } from "./screensaver-rotation-utils.ts";

export {
  canonicalJsonbText,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  settingsJsonbTextCasFilter,
} from "./org-settings-cas.ts";

export { SETTINGS_CONFLICT_MESSAGE } from "./org-settings-cas.ts";

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

export async function patchHiddenUrlsMutate(
  orgId: string,
  mutate: HiddenUrlsMutateFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any } | null
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  return patchOrgSettingsMutate(
    orgId,
    (prev, settingsAsRead) => {
      const currentList = hiddenListFromSettings(settingsAsRead);
      const nextList = sanitizeScreensaverHiddenUrlList(mutate(currentList));
      if (listsEqual(nextList, currentList)) {
        return null;
      }
      return { ...prev, [SETTINGS_KEY]: nextList };
    },
    db,
    {
      preWriteCheck: ({ settingsAsRead, nextSettings, useVersionCas }) => {
        if (useVersionCas) {
          return { ok: true };
        }
        const currentList = hiddenListFromSettings(settingsAsRead);
        const nextList = sanitizeScreensaverHiddenUrlList(
          nextSettings[SETTINGS_KEY]
        );
        if (hiddenListShrinks(currentList, nextList)) {
          return { ok: true };
        }
        const queryBytesNow = estimateSettingsPatchQueryBytes(
          orgId,
          settingsAsRead
        );
        const queryBytesNext = estimateSettingsPatchQueryBytes(
          orgId,
          nextSettings
        );
        if (
          Math.max(queryBytesNow, queryBytesNext) >
          HIDDEN_URLS_PATCH_URL_SAFE_BYTES
        ) {
          return { ok: false, error: HIDDEN_URLS_TOO_MANY_MESSAGE };
        }
        return { ok: true };
      },
    }
  );
}
