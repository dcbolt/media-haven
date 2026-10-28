/**
 * Per-device last report in app_config (key device_report:<uuid>).
 * Global rate limit: conditional update on updated_at (15s), no in-memory state.
 */

import { supabaseAdmin } from "./supabase.ts";
import {
  DEVICE_REPORT_KEY_PREFIX,
  DEVICE_REPORT_VALUE_MAX_BYTES,
  REPORT_RATE_LIMIT_MS,
  type DeviceReportsMap,
  type SanitizedDeviceReport,
  type StoredDeviceReportEntry,
} from "./tv-device-report-types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_WRITE_ATTEMPTS = 6;

/** True when a prior report was accepted within REPORT_RATE_LIMIT_MS (server clock). */
export function isDeviceReportRateLimited(
  prevUpdatedAt: string | null | undefined,
  receivedAt: string
): boolean {
  if (!prevUpdatedAt) return false;
  const rateCutoff = new Date(
    Date.parse(receivedAt) - REPORT_RATE_LIMIT_MS
  ).toISOString();
  return prevUpdatedAt > rateCutoff;
}

export function deviceReportConfigKey(deviceId: string): string {
  return `${DEVICE_REPORT_KEY_PREFIX}${deviceId}`;
}

function parseStoredEntry(raw: string): StoredDeviceReportEntry | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const receivedAt = String(o.receivedAt ?? "").trim();
    if (!Number.isFinite(Date.parse(receivedAt))) return null;
    if (o.auth !== "legacy") return null;
    const report = o.report;
    if (!report || typeof report !== "object") return null;
    return {
      receivedAt,
      auth: "legacy",
      report: report as SanitizedDeviceReport,
    };
  } catch {
    return null;
  }
}

export function sanitizeDeviceReportsMap(
  rows: { key: string; value: string }[]
): DeviceReportsMap {
  const out: DeviceReportsMap = {};
  for (const row of rows) {
    if (!row.key.startsWith(DEVICE_REPORT_KEY_PREFIX)) continue;
    const deviceId = row.key.slice(DEVICE_REPORT_KEY_PREFIX.length);
    if (!UUID_RE.test(deviceId)) continue;
    const entry = parseStoredEntry(row.value);
    if (!entry) continue;
    out[deviceId] = entry;
  }
  return out;
}

export async function loadDeviceReportsMap(): Promise<DeviceReportsMap> {
  const db = supabaseAdmin();
  if (!db) return {};
  const { data } = await db
    .from("app_config")
    .select("key, value")
    .like("key", `${DEVICE_REPORT_KEY_PREFIX}%`);
  return sanitizeDeviceReportsMap(
    (data ?? []) as { key: string; value: string }[]
  );
}

export async function loadDeviceReportEntry(
  deviceId: string
): Promise<StoredDeviceReportEntry | null> {
  if (!UUID_RE.test(deviceId)) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", deviceReportConfigKey(deviceId))
    .maybeSingle();
  if (!data?.value) return null;
  return parseStoredEntry(String(data.value));
}

export type PersistDeviceReportResult =
  | { ok: true }
  | { ok: false; error: string; rateLimited?: boolean };

function buildStoredValue(
  report: SanitizedDeviceReport,
  receivedAt: string
): string | null {
  const payload = { receivedAt, auth: "legacy" as const, report };
  const value = JSON.stringify(payload);
  if (Buffer.byteLength(value, "utf8") > DEVICE_REPORT_VALUE_MAX_BYTES) {
    return null;
  }
  return value;
}

/**
 * Persist one device report. Rate limit is enforced globally via
 * app_config.updated_at CAS (must be older than REPORT_RATE_LIMIT_MS).
 */
export async function persistDeviceReport(
  deviceId: string,
  report: SanitizedDeviceReport,
  receivedAt: string,
  dbOverride: ReturnType<typeof supabaseAdmin> = null
): Promise<PersistDeviceReportResult> {
  if (!UUID_RE.test(deviceId)) {
    return { ok: false, error: "bad device id" };
  }
  const db = dbOverride ?? supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const value = buildStoredValue(report, receivedAt);
  if (!value) return { ok: false, error: "report too large" };

  const key = deviceReportConfigKey(deviceId);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { data: row, error: readErr } = await db
      .from("app_config")
      .select("key, updated_at")
      .eq("key", key)
      .maybeSingle();

    if (readErr) {
      return { ok: false, error: readErr.message || "read failed" };
    }

    if (isDeviceReportRateLimited(row?.updated_at as string | undefined, receivedAt)) {
      return { ok: false, rateLimited: true, error: "rate limited" };
    }

    if (!row) {
      const { error: insErr } = await db.from("app_config").insert({
        key,
        value,
        updated_at: receivedAt,
      });
      if (!insErr) return { ok: true };
      if (String(insErr.code) === "23505") continue;
      return { ok: false, error: insErr.message || "insert failed" };
    }

    const prevUpdated = row.updated_at as string;
    const { data: updated, error: updErr } = await db
      .from("app_config")
      .update({ value, updated_at: receivedAt })
      .eq("key", key)
      .eq("updated_at", prevUpdated)
      .select("key");

    if (updErr) {
      return { ok: false, error: updErr.message || "update failed" };
    }
    if (updated && updated.length > 0) return { ok: true };
  }

  const { data: again } = await db
    .from("app_config")
    .select("updated_at")
    .eq("key", key)
    .maybeSingle();
  if (
    isDeviceReportRateLimited(again?.updated_at as string | undefined, receivedAt)
  ) {
    return { ok: false, rateLimited: true, error: "rate limited" };
  }
  return { ok: false, error: "write conflict" };
}

export async function touchDeviceLastSeen(deviceId: string): Promise<void> {
  const db = supabaseAdmin();
  if (!db || !UUID_RE.test(deviceId)) return;
  const at = new Date().toISOString();
  await db.from("tv_devices").update({ last_seen: at }).eq("id", deviceId);
}
