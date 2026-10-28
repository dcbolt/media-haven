/**
 * orgs.settings.deviceReports — last report per device (CAS, no migration).
 */

/** Tenant Zero org id (0019) — avoid importing org.ts (Node fixture closure). */
const FLORIDA_HAVENS_ORG_ID = "11111111-1111-4111-8111-111111111111";
import {
  patchOrgSettingsMutate,
  SETTINGS_CONFLICT_MESSAGE,
} from "./org-settings-cas.ts";
import { supabaseAdmin } from "./supabase.ts";
import {
  REPORT_WRITE_MIN_INTERVAL_MS,
  type DeviceReportsMap,
  type SanitizedDeviceReport,
  type StoredDeviceReportEntry,
} from "./tv-device-report-types.ts";
import { reportsEqual } from "./tv-device-report-parse.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Max serialized bytes per device entry (report + metadata). */
export const DEVICE_REPORT_ENTRY_MAX_BYTES = 4 * 1024;

export function sanitizeDeviceReportsMap(raw: unknown): DeviceReportsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DeviceReportsMap = {};
  const now = Date.now();
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!UUID_RE.test(id)) continue;
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const receivedAt = String(o.receivedAt ?? "").trim();
    if (!Number.isFinite(Date.parse(receivedAt))) continue;
    if (now - Date.parse(receivedAt) > 90 * 24 * 3600_000) continue;
    const auth = o.auth === "legacy" ? "legacy" : null;
    if (!auth) continue;
    const report = o.report;
    if (!report || typeof report !== "object") continue;
    const parentDeviceId =
      typeof o.parentDeviceId === "string" && UUID_RE.test(o.parentDeviceId)
        ? o.parentDeviceId
        : undefined;
    const entry: StoredDeviceReportEntry = {
      receivedAt,
      auth: "legacy",
      parentDeviceId,
      report: report as SanitizedDeviceReport,
    };
    const bytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
    if (bytes > DEVICE_REPORT_ENTRY_MAX_BYTES) continue;
    out[id] = entry;
  }
  return out;
}

export async function loadDeviceReportsMap(
  orgId: string = FLORIDA_HAVENS_ORG_ID
): Promise<DeviceReportsMap> {
  const db = supabaseAdmin();
  if (!db) return {};
  const { data } = await db
    .from("orgs")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (!data?.settings || typeof data.settings !== "object") return {};
  return sanitizeDeviceReportsMap(
    (data.settings as Record<string, unknown>).deviceReports
  );
}

export type PersistReportInput = {
  deviceId: string;
  report: SanitizedDeviceReport;
  parentDeviceId?: string;
  receivedAt: string;
};

export type PersistReportResult =
  | { ok: true; wroteSettings: boolean }
  | { ok: false; error: string; conflict?: boolean };

function shouldWriteSettings(
  prev: StoredDeviceReportEntry | undefined,
  nextReport: SanitizedDeviceReport,
  receivedAt: string
): boolean {
  if (!prev) return true;
  if (!reportsEqual(prev.report, nextReport)) return true;
  const age = Date.parse(receivedAt) - Date.parse(prev.receivedAt);
  return age >= REPORT_WRITE_MIN_INTERVAL_MS;
}

export async function persistDeviceReports(
  updates: PersistReportInput[],
  orgId: string = FLORIDA_HAVENS_ORG_ID,
  dbOverride: ReturnType<typeof supabaseAdmin> = null
): Promise<PersistReportResult> {
  if (updates.length === 0) return { ok: true, wroteSettings: false };
  const db = dbOverride ?? supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  let wroteSettings = false;

  const result = await patchOrgSettingsMutate(
    orgId,
    (prev) => {
      const map = sanitizeDeviceReportsMap(prev.deviceReports);
      let changed = false;
      for (const u of updates) {
        if (!UUID_RE.test(u.deviceId)) continue;
        const entryBytes = Buffer.byteLength(
          JSON.stringify({
            receivedAt: u.receivedAt,
            auth: "legacy",
            parentDeviceId: u.parentDeviceId,
            report: u.report,
          }),
          "utf8"
        );
        if (entryBytes > DEVICE_REPORT_ENTRY_MAX_BYTES) continue;

        const existing = map[u.deviceId];
        if (!shouldWriteSettings(existing, u.report, u.receivedAt)) {
          continue;
        }
        map[u.deviceId] = {
          receivedAt: u.receivedAt,
          auth: "legacy",
          parentDeviceId: u.parentDeviceId,
          report: u.report,
        };
        changed = true;
        wroteSettings = true;
      }
      if (!changed) return null;
      return { ...prev, deviceReports: map };
    },
    db
  );

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === SETTINGS_CONFLICT_MESSAGE
          ? SETTINGS_CONFLICT_MESSAGE
          : result.error,
      conflict: result.conflict,
    };
  }
  return { ok: true, wroteSettings };
}

export async function touchDeviceLastSeen(deviceIds: string[]): Promise<void> {
  const db = supabaseAdmin();
  if (!db || deviceIds.length === 0) return;
  const at = new Date().toISOString();
  for (const id of deviceIds) {
    if (!UUID_RE.test(id)) continue;
    await db.from("tv_devices").update({ last_seen: at }).eq("id", id);
  }
}
