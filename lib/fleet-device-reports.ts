/**
 * Fleet helpers: device report metadata for /host/tvs.
 */

import {
  alertHeartbeatIso,
  effectiveOfflineThresholdMinutes,
  isDeviceStaleForAlerts,
  isReportFresh,
} from "./offline-alert-policy.ts";
import { supabaseAdmin } from "./supabase.ts";
import { loadDeviceReportsForDevices } from "./tv-device-report-store.ts";
import {
  NEXT_REPORT_S,
  type DeviceReportType,
  type StoredDeviceReportEntry,
} from "./tv-device-report-types.ts";

export type FleetLinkStatus = "online" | "stale" | "offline";

export type FleetDeviceMeta = {
  deviceId: string;
  reportedType: DeviceReportType | "unknown";
  lastReportAt: string | null;
  auth: "legacy" | "token" | null;
  appVersion: string | null;
  appBuild: string | null;
  firmware: string | null;
  mode: string | null;
  foregroundHint: string | null;
  feedLastOkAt: string | null;
  feedLastError: string | null;
  feedUsingLastGood: boolean | null;
  lastErrors: { at: string; code: string; msg: string }[];
  linkStatus: FleetLinkStatus;
};

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
  const nowMs = Date.now();
  const [reports, openIncidents] = await Promise.all([
    loadDeviceReportsForDevices(devices.map((d) => d.id)),
    loadOpenOfflineIncidents(),
  ]);

  const out = new Map<string, FleetDeviceMeta>();
  for (const d of devices) {
    const entry = reports[d.id];
    const reportedType = entry?.report.reportedType ?? "unknown";
    const serverHeartbeat = alertHeartbeatIso(entry, d.last_seen, nowMs);
    const thresh = effectiveOfflineThresholdMinutes(
      entry,
      thresholdMinFallback,
      nowMs
    );
    const offlineThreshold = isDeviceStaleForAlerts(
      serverHeartbeat,
      thresh,
      nowMs
    );
    const linkStatus = computeLinkStatus(
      serverHeartbeat,
      openIncidents.has(d.id),
      Boolean(d.property_id && offlineThreshold)
    );

    out.set(d.id, {
      deviceId: d.id,
      reportedType,
      lastReportAt: isReportFresh(entry, nowMs) ? entry?.receivedAt ?? null : null,
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
