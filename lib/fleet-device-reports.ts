/**
 * Fleet helpers: device report metadata for /host/tvs (Screens & Devices).
 * Online/stale/offline use SERVER receivedAt / last_seen only.
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
  /** Unverified client hint — display only. */
  reportedType: DeviceReportType | "unknown";
  lastReportAt: string | null;
  auth: "legacy" | null;
  appVersion: string | null;
  appBuild: string | null;
  firmware: string | null;
  mode: string | null;
  /** Hint for offline suppression — not used for link status timing. */
  foregroundHint: string | null;
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

/** Authoritative heartbeat for fleet + alerts (server timestamps only). */
export function heartbeatIso(
  entry: StoredDeviceReportEntry | undefined,
  lastSeen: string
): string {
  return entry?.receivedAt ?? lastSeen;
}

export function computeLinkStatus(
  serverHeartbeat: string,
  hasOpenIncident: boolean,
  offlineByThreshold: boolean,
  nextReportS: number = NEXT_REPORT_S
): FleetLinkStatus {
  if (hasOpenIncident || offlineByThreshold) return "offline";
  const ageMs = Date.now() - Date.parse(serverHeartbeat);
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

/** TV offline alert suppression hint — not authoritative for timing. */
export function tvForegroundHintAllowsOfflineAlert(
  entry: StoredDeviceReportEntry | undefined
): boolean {
  if (!entry) return false;
  return entry.report.foreground === "signage";
}

export function isOfflineByThreshold(
  serverHeartbeat: string,
  reportedType: DeviceReportType | "unknown",
  thresholdMinFallback: number,
  entry: StoredDeviceReportEntry | undefined
): boolean {
  const typeThreshold = offlineThresholdMinutesForType(reportedType);
  if (reportedType === "node" || reportedType === "signboard") {
    const min = typeThreshold ?? thresholdMinFallback;
    return Date.now() - Date.parse(serverHeartbeat) > min * 60_000;
  }
  if (TV_LIKE_TYPES.has(reportedType as DeviceReportType)) {
    if (!tvForegroundHintAllowsOfflineAlert(entry)) return false;
    return (
      Date.now() - Date.parse(serverHeartbeat) >
      thresholdMinFallback * 60_000
    );
  }
  return Date.now() - Date.parse(serverHeartbeat) > thresholdMinFallback * 60_000;
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
    const reportedType = entry?.report.reportedType ?? "unknown";
    const serverHeartbeat = heartbeatIso(entry, d.last_seen);
    const offlineThreshold = isOfflineByThreshold(
      serverHeartbeat,
      reportedType,
      thresholdMinFallback,
      entry
    );
    const linkStatus = computeLinkStatus(
      serverHeartbeat,
      openIncidents.has(d.id),
      Boolean(d.property_id && offlineThreshold)
    );

    out.set(d.id, {
      deviceId: d.id,
      reportedType,
      lastReportAt: entry?.receivedAt ?? null,
      auth: entry?.auth ?? null,
      appVersion: entry?.report.app?.version ?? null,
      appBuild: entry?.report.app?.build ?? null,
      firmware: entry?.report.firmware ?? null,
      mode: entry?.report.mode ?? null,
      foregroundHint: entry?.report.foreground ?? null,
      feedLastOkAt: entry?.report.feed?.lastOkAt ?? null,
      feedLastError: entry?.report.feed?.lastError ?? null,
      feedUsingLastGood: entry?.report.feed?.usingLastGood ?? null,
      lastErrors: entry?.report.errors ?? [],
      linkStatus,
    });
  }
  return out;
}
