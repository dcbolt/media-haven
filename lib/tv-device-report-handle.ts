/**
 * POST /api/tv/report — soft-mode write-only telemetry.
 *
 * Token mode (future): Bearer token maps to device id (hash-only storage);
 * nodes may include linked children only after token auth — not in soft mode.
 */

import { supabaseAdmin } from "./supabase.ts";
import { parseDeviceReportPayload } from "./tv-device-report-parse.ts";
import {
  persistDeviceReport,
  touchDeviceLastSeen,
} from "./tv-device-report-store.ts";
import { NEXT_REPORT_S } from "./tv-device-report-types.ts";

export type TvReportSuccess = {
  ok: true;
  nextReportS: number;
};

export type TvReportFailure =
  | { ok: false; status: 404 }
  | { ok: false; status: 413; error: string }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 429; retryAfterSec: number }
  | { ok: false; status: 503; error: string };

export async function handleTvDeviceReport(
  rawBody: unknown,
  opts?: {
    nowMs?: number;
    dbOverride?: NonNullable<ReturnType<typeof supabaseAdmin>>;
  }
): Promise<TvReportSuccess | TvReportFailure> {
  const nowMs = opts?.nowMs ?? Date.now();
  const parsed = parseDeviceReportPayload(rawBody);
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }

  const { report } = parsed;
  const deviceId = report.deviceId;

  const db = opts?.dbOverride ?? supabaseAdmin();
  if (!db) {
    return { ok: false, status: 503, error: "no database" };
  }

  const { data: deviceRow } = await db
    .from("tv_devices")
    .select("id, property_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (!deviceRow?.property_id) {
    return { ok: false, status: 404 };
  }

  const receivedAt = new Date(nowMs).toISOString();
  const persist = await persistDeviceReport(
    deviceId,
    report,
    receivedAt,
    db
  );
  if (!persist.ok) {
    if (persist.rateLimited) {
      return { ok: false, status: 429, retryAfterSec: 15 };
    }
    return { ok: false, status: 503, error: persist.error };
  }

  await touchDeviceLastSeen(deviceId);

  return {
    ok: true,
    nextReportS: NEXT_REPORT_S,
  };
}
