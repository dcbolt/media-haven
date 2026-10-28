/**
 * Fleet helpers: device report metadata for /host/tvs (Screens & Devices).
 */

import { supabaseAdmin } from "./supabase.ts";
import { loadDeviceReportsMap } from "./tv-device-report-store.ts";
import {
  NEXT_REPORT_S,
  type DeviceReportType,
  type StoredDeviceReportEntry,
} from "./tv-device-report-types.ts";

export type FleetLinkStatus = "online" | "stale" | "offline";

export type FleetDeviceMeta = {
  deviceId: string;
  reportType: DeviceReportType | "unknown";
  lastReportAt: string | null;
  parentDeviceId: string | null;
  auth: "legacy" | null;
  appVersion: string | null;
  appBuild: string | null;
  firmware: string | null;
  mode: string | null;
  foreground: string | null;
  feedLastOkAt: string | null;
  feedLastError: string | null;
  feedUsingLastGood: boolean | null;
  lastErrors: { at: string; code: string; msg: string }[];
  linkStatus: FleetLinkStatus;
};

const TV_LIKE_TYPES = new Set<DeviceReportType>([
  "roku",
  "web_tv",
  "samsung",
  "firetv",
  "vizio",
  "sony",
  "unknown",
]);

export function heartbeatIso(
  entry: StoredDeviceReportEntry | undefined,
  lastSeen: string
): string {
  return entry?.receivedAt ?? lastSeen;
}

export function computeLinkStatus(
  heartbeat: string,
  hasOpenIncident: boolean,
  offlineByThreshold: boolean,
  nextReportS: number = NEXT_REPORT_S
): FleetLinkStatus {
  if (hasOpenIncident || offlineByThreshold) return "offline";
  const ageMs = Date.now() - Date.parse(heartbeat);
  if (ageMs < nextReportS * 3 * 1000) return "online";
  return "stale";
}

export function offlineThresholdMinutesForType(
  type: DeviceReportType | "unknown"
): number | null {
  if (type === "node") return 15;
  if (type === "signboard") return 10;
  if (TV_LIKE_TYPES.has(type as DeviceReportType)) return null;
  return null;
}

export function tvEligibleForOfflineAlert(
  entry: StoredDeviceReportEntry | undefined
): boolean {
  if (!entry) return false;
  const fg = entry.report.foreground;
  return fg === "signage";
}

export function isOfflineByThreshold(
  heartbeat: string,
  type: DeviceReportType | "unknown",
  thresholdMinFallback: number,
  entry: StoredDeviceReportEntry | undefined
): boolean {
  const typeThreshold = offlineThresholdMinutesForType(type);
  if (type === "node" || type === "signboard") {
    const min = typeThreshold ?? thresholdMinFallback;
    return Date.now() - Date.parse(heartbeat) > min * 60_000;
  }
  if (TV_LIKE_TYPES.has(type as DeviceReportType)) {
    if (!tvEligibleForOfflineAlert(entry)) return false;
    return (
      Date.now() - Date.parse(heartbeat) >
      thresholdMinFallback * 60_000
    );
  }
  return Date.now() - Date.parse(heartbeat) > thresholdMinFallback * 60_000;
}

export async function loadOpenOfflineIncidents(): Promise<Set<string>> {
  const db = supabaseAdmin();
  if (!db) return new Set();
  const { data } = await db
    .from("tv_offline_alerts")
    .select("tv_device_id")
    .is("recovered_at", null);
  return new Set((data ?? []).map((r) => r.tv_device_id as string));
}

export async function buildFleetDeviceMeta(
  devices: { id: string; last_seen: string; property_id: string | null }[],
  thresholdMinFallback: number
): Promise<Map<string, FleetDeviceMeta>> {
  const [reports, openIncidents] = await Promise.all([
    loadDeviceReportsMap(),
    loadOpenOfflineIncidents(),
  ]);

  const out = new Map<string, FleetDeviceMeta>();
  for (const d of devices) {
    const entry = reports[d.id];
    const reportType = entry?.report.type ?? "unknown";
    const heartbeat = heartbeatIso(entry, d.last_seen);
    const offlineThreshold = isOfflineByThreshold(
      heartbeat,
      reportType,
      thresholdMinFallback,
      entry
    );
    const linkStatus = computeLinkStatus(
      heartbeat,
      openIncidents.has(d.id),
      Boolean(d.property_id && offlineThreshold)
    );

    out.set(d.id, {
      deviceId: d.id,
      reportType,
      lastReportAt: entry?.receivedAt ?? null,
      parentDeviceId: entry?.parentDeviceId ?? null,
      auth: entry?.auth ?? null,
      appVersion: entry?.report.app?.version ?? null,
      appBuild: entry?.report.app?.build ?? null,
      firmware: entry?.report.firmware ?? null,
      mode: entry?.report.mode ?? null,
      foreground: entry?.report.foreground ?? null,
      feedLastOkAt: entry?.report.feed?.lastOkAt ?? null,
      feedLastError: entry?.report.feed?.lastError ?? null,
      feedUsingLastGood: entry?.report.feed?.usingLastGood ?? null,
      lastErrors: entry?.report.errors ?? [],
      linkStatus,
    });
  }
  return out;
}

/** Node device ids → child device ids (from stored parentDeviceId). */
export function groupChildrenByNode(
  reports: Awaited<ReturnType<typeof loadDeviceReportsMap>>
): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(reports)) {
    const pid = entry.parentDeviceId;
    if (!pid) continue;
    const arr = byParent.get(pid) ?? [];
    arr.push(id);
    byParent.set(pid, arr);
  }
  return byParent;
}
