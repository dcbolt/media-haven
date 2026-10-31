/**
 * Per-device last report in app_config (key device_report:<canonical-uuid>).
 */

import { canonicalDeviceId } from "./tv-device-id.ts";
import { supabaseAdmin } from "./supabase.ts";
import {
  DEVICE_REPORT_KEY_PREFIX,
  DEVICE_REPORT_VALUE_MAX_BYTES,
  REPORT_RATE_LIMIT_MS,
  type DeviceReportsMap,
  type SanitizedDeviceReport,
  type StoredDeviceReportEntry,
} from "./tv-device-report-types.ts";

export const MAX_DEVICE_REPORT_LOAD = 500;
const IN_QUERY_CHUNK = 80;

const MAX_WRITE_ATTEMPTS = 6;

export function isDeviceReportRateLimited(
  prevUpdatedAt: string | null | undefined,
  receivedAt: string
): boolean {
  if (!prevUpdatedAt) return false;
  const prevMs = Date.parse(prevUpdatedAt);
  const recvMs = Date.parse(receivedAt);
  if (!Number.isFinite(prevMs) || !Number.isFinite(recvMs)) return false;
  return recvMs - prevMs < REPORT_RATE_LIMIT_MS;
}

export function deviceReportConfigKey(deviceId: string): string {
  const id = canonicalDeviceId(deviceId) ?? deviceId.toLowerCase();
  return `${DEVICE_REPORT_KEY_PREFIX}${id}`;
}

function parseStoredEntry(raw: string): StoredDeviceReportEntry | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const receivedAt = String(o.receivedAt ?? "").trim();
    if (!Number.isFinite(Date.parse(receivedAt))) return null;
    if (o.auth !== "legacy" && o.auth !== "token") return null;
    const report = o.report;
    if (!report || typeof report !== "object") return null;
    // Soft mode never persists token auth — downgrade so alerts stay on last_seen (F-3267).
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
  rows: { key: string; value: string }[],
  allowedDeviceIds?: Set<string>
): DeviceReportsMap {
  const out: DeviceReportsMap = {};
  for (const row of rows) {
    if (!row.key.startsWith(DEVICE_REPORT_KEY_PREFIX)) continue;
    const deviceId = row.key.slice(DEVICE_REPORT_KEY_PREFIX.length);
    const canonical = canonicalDeviceId(deviceId);
    if (!canonical) continue;
    if (allowedDeviceIds && !allowedDeviceIds.has(canonical)) continue;
    const entry = parseStoredEntry(row.value);
    if (!entry) continue;
    out[canonical] = entry;
  }
  return out;
}

/** Load reports only for known fleet device ids (bounded; orphans ignored). */
export async function loadDeviceReportsForDevices(
  deviceIds: string[]
): Promise<DeviceReportsMap> {
  const db = supabaseAdmin();
  if (!db || deviceIds.length === 0) return {};

  const allowed = new Set<string>();
  const keys: string[] = [];
  for (const raw of deviceIds) {
    const id = canonicalDeviceId(raw);
    if (!id || allowed.has(id)) continue;
    allowed.add(id);
    keys.push(deviceReportConfigKey(id));
    if (keys.length >= MAX_DEVICE_REPORT_LOAD) break;
  }
  if (keys.length === 0) return {};

  const rows: { key: string; value: string }[] = [];
  for (let i = 0; i < keys.length; i += IN_QUERY_CHUNK) {
    const chunk = keys.slice(i, i + IN_QUERY_CHUNK);
    const { data } = await db
      .from("app_config")
      .select("key, value")
      .in("key", chunk);
    rows.push(...((data ?? []) as { key: string; value: string }[]));
  }
  return sanitizeDeviceReportsMap(rows, allowed);
}

export async function loadDeviceReportEntry(
  deviceId: string
): Promise<StoredDeviceReportEntry | null> {
  const id = canonicalDeviceId(deviceId);
  if (!id) return null;
  const db = supabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from("app_config")
    .select("value")
    .eq("key", deviceReportConfigKey(id))
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

export type PersistDeviceReportOptions = {
  /** When false, skips updated_at CAS (mutation tests only). */
  requireUpdatedAtCas?: boolean;
};

export async function persistDeviceReport(
  deviceId: string,
  report: SanitizedDeviceReport,
  receivedAt: string,
  dbOverride: ReturnType<typeof supabaseAdmin> = null,
  options?: PersistDeviceReportOptions
): Promise<PersistDeviceReportResult> {
  const id = canonicalDeviceId(deviceId);
  if (!id) return { ok: false, error: "bad device id" };
  const db = dbOverride ?? supabaseAdmin();
  if (!db) return { ok: false, error: "no database" };

  const value = buildStoredValue({ ...report, deviceId: id }, receivedAt);
  if (!value) return { ok: false, error: "report too large" };

  const key = deviceReportConfigKey(id);
  const requireCas = options?.requireUpdatedAtCas !== false;

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

    let q = db
      .from("app_config")
      .update({ value, updated_at: receivedAt })
      .eq("key", key);
    if (requireCas) {
      q = q.eq("updated_at", row.updated_at as string);
    }
    const { data: updated, error: updErr } = await q.select("key");

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

/** Remove stored telemetry when host forgets a device (same owner action). */
export async function deleteDeviceReportConfig(deviceId: string): Promise<void> {
  const id = canonicalDeviceId(deviceId);
  if (!id) return;
  const db = supabaseAdmin();
  if (!db) return;
  await db
    .from("app_config")
    .delete()
    .eq("key", deviceReportConfigKey(id));
}

export async function touchDeviceLastSeen(deviceId: string): Promise<void> {
  const id = canonicalDeviceId(deviceId);
  if (!id) return;
  const db = supabaseAdmin();
  if (!db) return;
  const at = new Date().toISOString();
  await db.from("tv_devices").update({ last_seen: at }).eq("id", id);
}
