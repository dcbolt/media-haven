/**
 * Offline alert sweep policy (F-3155/F-3157 + Auditor 2 A).
 *
 * Soft (legacy, unauthenticated) reports are stored for fleet UI only — they
 * must not suppress, mute, open, or close alerts. Alert timing matches
 * 33e551e: `tv_devices.last_seen` vs host threshold only.
 *
 * Token-authenticated reports (future): fresh receivedAt may prove liveness;
 * per-type thresholds and foreground suppression apply only when auth === "token".
 */

import { NEXT_REPORT_S } from "./tv-device-report-types.ts";
import type { DeviceReportType } from "./tv-device-report-types.ts";
import type { StoredDeviceReportEntry } from "./tv-device-report-types.ts";

export const REPORT_FRESH_MS = NEXT_REPORT_S * 3 * 1000;

function isTokenAuthenticated(
  entry: StoredDeviceReportEntry | undefined
): boolean {
  return entry?.auth === "token";
}

export function isReportFresh(
  entry: StoredDeviceReportEntry | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!entry?.receivedAt) return false;
  const atMs = Date.parse(entry.receivedAt);
  if (!Number.isFinite(atMs)) return false;
  return nowMs - atMs < REPORT_FRESH_MS;
}

/** Heartbeat used for offline/stale alerts (legacy → last_seen only). */
export function alertHeartbeatIso(
  entry: StoredDeviceReportEntry | undefined,
  lastSeen: string,
  _nowMs: number = Date.now()
): string {
  if (isTokenAuthenticated(entry) && isReportFresh(entry, _nowMs)) {
    return entry!.receivedAt;
  }
  return lastSeen;
}

/** Suppress opening a new incident only — token auth + fresh hint; never legacy. */
export function shouldSuppressNewOfflineIncident(
  entry: StoredDeviceReportEntry | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!isTokenAuthenticated(entry) || !isReportFresh(entry, nowMs)) {
    return false;
  }
  const fg = entry!.report.foreground;
  return fg === "streaming" || fg === "standby";
}

export function effectiveOfflineThresholdMinutes(
  entry: StoredDeviceReportEntry | undefined,
  legacyThresholdMin: number,
  nowMs: number = Date.now()
): number {
  if (!isTokenAuthenticated(entry) || !isReportFresh(entry, nowMs)) {
    return legacyThresholdMin;
  }
  const type = entry!.report.reportedType ?? "unknown";
  if (type === "node") return 15;
  if (type === "signboard") return 10;
  return legacyThresholdMin;
}

export function isDeviceStaleForAlerts(
  heartbeatIso: string,
  thresholdMin: number,
  nowMs: number = Date.now()
): boolean {
  const hbMs = Date.parse(heartbeatIso);
  if (!Number.isFinite(hbMs)) return true;
  return nowMs - hbMs >= thresholdMin * 60_000;
}

export type { DeviceReportType };
