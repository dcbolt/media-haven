/**
 * PostgREST optimistic concurrency for orgs.settings.
 *
 * Preferred: `version` column CAS (migration 0024) — small PATCH URL.
 * Fallback: whole settings::text CAS (#171) when version column is absent
 * (42703 / PGRST204) so code can deploy before migration runs.
 */

import {
  canonicalJsonbText,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  settingsJsonbTextCasFilter,
} from "./screensaver-hidden-cas-legacy.ts";

export {
  canonicalJsonbText,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  settingsJsonbTextCasFilter,
} from "./screensaver-hidden-cas-legacy.ts";

export const ORG_SETTINGS_MAX_WRITE_ATTEMPTS = 6;
const MAX_WRITE_ATTEMPTS = ORG_SETTINGS_MAX_WRITE_ATTEMPTS;

export const SETTINGS_CONFLICT_MESSAGE = "settings conflict — retry";

/** Max JSON body for settings PATCH (version CAS — not URL-limited). */
export const SETTINGS_PATCH_BODY_MAX_BYTES = 512 * 1024;

export const SETTINGS_BODY_TOO_LARGE_MESSAGE =
  "Settings payload too large to save; contact admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = { from: (table: string) => any };

let versionColumnProbe: boolean | null = null;

export function resetOrgSettingsVersionProbeForTests(): void {
  versionColumnProbe = null;
}

/** Pin version CAS on/off in unit tests (null = probe PostgREST). */
export function setOrgSettingsVersionProbeForTests(enabled: boolean | null): void {
  versionColumnProbe = enabled;
}

function isMissingVersionColumnError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("column orgs.version does not exist") ||
    (msg.includes("version") && msg.includes("schema cache"))
  );
}

async function probeVersionColumn(db: DbLike): Promise<boolean> {
  if (versionColumnProbe === false) return false;
  if (versionColumnProbe === true) return true;
  const { error } = await db
    .from("orgs")
    .select("version")
    .eq("id", "11111111-1111-4111-8111-111111111111")
    .maybeSingle();
  if (!error) {
    versionColumnProbe = true;
    return true;
  }
  if (isMissingVersionColumnError(error)) {
    versionColumnProbe = false;
    return false;
  }
  versionColumnProbe = true;
  return true;
}

function settingsRecord(settings: unknown): Record<string, unknown> {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    return { ...(settings as Record<string, unknown>) };
  }
  return {};
}

function estimateSettingsBodyBytes(settings: unknown): number {
  return Buffer.byteLength(JSON.stringify(settings), "utf8");
}

function gatewayFailureMessage(writeErr: { message?: string } | null): string {
  const msg = writeErr?.message?.trim();
  if (!msg) return HIDDEN_URLS_TOO_MANY_MESSAGE;
  return msg;
}

export type OrgSettingsMutateResult =
  | { ok: true }
  | { ok: false; error: string; conflict?: boolean };

export type OrgSettingsMutateFn = (
  prev: Record<string, unknown>,
  settingsAsRead: unknown
) => Record<string, unknown> | null;

export type OrgSettingsPreWriteContext = {
  settingsAsRead: unknown;
  nextSettings: Record<string, unknown>;
  useVersionCas: boolean;
  listShrinks?: boolean;
};

/**
 * Read-modify-write orgs.settings with version or legacy whole-settings CAS.
 */
export async function patchOrgSettingsMutate(
  orgId: string,
  mutate: OrgSettingsMutateFn,
  db: DbLike | null,
  options?: {
    preWriteCheck?: (ctx: OrgSettingsPreWriteContext) => { ok: true } | { ok: false; error: string };
  }
): Promise<OrgSettingsMutateResult> {
  if (!db) return { ok: false, error: "no database" };

  let useVersionCas = await probeVersionColumn(db);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const selectCols = useVersionCas ? "settings,version" : "settings";
    const { data: row, error: readErr } = await db
      .from("orgs")
      .select(selectCols)
      .eq("id", orgId)
      .maybeSingle();

    if (readErr) {
      if (useVersionCas && isMissingVersionColumnError(readErr)) {
        useVersionCas = false;
        versionColumnProbe = false;
        continue;
      }
      return { ok: false, error: readErr.message || "read failed" };
    }
    if (!row || typeof row !== "object") {
      return { ok: false, error: "org missing — apply 0019" };
    }

    const settingsAsRead = (row as { settings: unknown }).settings;
    const prev = settingsRecord(settingsAsRead);
    const nextSettings = mutate(prev, settingsAsRead);
    if (nextSettings === null) {
      return { ok: true };
    }

    if (options?.preWriteCheck) {
      const check = options.preWriteCheck({
        settingsAsRead,
        nextSettings,
        useVersionCas,
      });
      if (!check.ok) return { ok: false, error: check.error };
    }

    if (useVersionCas) {
      const bodyBytes = estimateSettingsBodyBytes(nextSettings);
      if (bodyBytes > SETTINGS_PATCH_BODY_MAX_BYTES) {
        return { ok: false, error: SETTINGS_BODY_TOO_LARGE_MESSAGE };
      }
      const version = Number((row as { version?: unknown }).version);
      if (!Number.isFinite(version)) {
        return { ok: false, error: "read failed" };
      }
      const { data: updated, error: writeErr } = await db
        .from("orgs")
        .update({ settings: nextSettings })
        .eq("id", orgId)
        .eq("version", version)
        .select("id");
      if (writeErr) {
        if (isMissingVersionColumnError(writeErr)) {
          useVersionCas = false;
          versionColumnProbe = false;
          continue;
        }
        return { ok: false, error: gatewayFailureMessage(writeErr) };
      }
      if (updated && updated.length > 0) {
        return { ok: true };
      }
      continue;
    }

    const cas = settingsJsonbTextCasFilter(settingsAsRead);
    const { data: updated, error: writeErr } = await db
      .from("orgs")
      .update({ settings: nextSettings })
      .eq("id", orgId)
      .filter(cas.column, cas.operator, cas.value)
      .select("id");
    if (writeErr) {
      return { ok: false, error: gatewayFailureMessage(writeErr) };
    }
    if (updated && updated.length > 0) {
      return { ok: true };
    }
  }

  return { ok: false, error: SETTINGS_CONFLICT_MESSAGE, conflict: true };
}
