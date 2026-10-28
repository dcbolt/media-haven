/**
 * POST /api/tv/report — soft-mode write-only telemetry.
 *
 * Token mode (future): Bearer token maps to device id (hash-only storage);
 * nodes may include linked children only after token auth — not in soft mode.
 */

import { supabaseAdmin } from "./supabase.ts";
import { parseDeviceReportPayload } from "./tv-device-report-parse.ts";
import { persistDeviceReport } from "./tv-device-report-store.ts";
import { NEXT_REPORT_S } from "./tv-device-report-types.ts";

export type TvReportSuccess = {
  ok: true;
  nextReportS: number;
};

/** Short server-side class for logs only — never sent to clients (F-3248). */
export type TvReportFailureLogCode =
  | "no_db"
  | "persist_read"
  | "persist_insert"
  | "persist_update"
  | "persist_conflict";

export type TvReportFailure =
  | { ok: false; status: 404 }
  | { ok: false; status: 413; error: string }
  | { ok: false; status: 400; error: string }
  | { ok: false; status: 429; retryAfterSec: number }
  | { ok: false; status: 503; logCode: TvReportFailureLogCode };

function classifyPersistFailure(
  persist: { ok: false; error: string; rateLimited?: boolean }
): TvReportFailureLogCode {
  const e = persist.error.toLowerCase();
  if (e.includes("read failed") || e.includes("read")) return "persist_read";
  if (e.includes("insert")) return "persist_insert";
  if (e.includes("update")) return "persist_update";
  if (e.includes("conflict")) return "persist_conflict";
  return "persist_update";
}

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
    return { ok: false, status: 503, logCode: "no_db" };
  }

  const { data: deviceRow } = await db
    .from("tv_devices")
    .select("id, property_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (!deviceRow?.id || deviceRow.property_id == null) {
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
    if (persist.error === "report too large") {
      return { ok: false, status: 413, error: "report too large" };
    }
    return {
      ok: false,
      status: 503,
      logCode: classifyPersistFailure(persist),
    };
  }

  return {
    ok: true,
    nextReportS: NEXT_REPORT_S,
  };
}
