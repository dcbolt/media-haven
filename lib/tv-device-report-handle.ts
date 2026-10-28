/**
 * POST /api/tv/report — accept heartbeat reports for claimed devices only.
 */

import { consumeRateLimit } from "./in-memory-rate-limit.ts";
import { supabaseAdmin } from "./supabase.ts";
import { parseDeviceReportPayload } from "./tv-device-report-parse.ts";
import {
  persistDeviceReports,
  touchDeviceLastSeen,
  type PersistReportInput,
} from "./tv-device-report-store.ts";
import { NEXT_REPORT_S } from "./tv-device-report-types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TvReportSuccess = {
  ok: true;
  nextReportS: number;
  rejectedChildren: number;
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
  const parsed = parseDeviceReportPayload(rawBody, { allowChildren: true });
  if (!parsed.ok) {
    return { ok: false, status: 400, error: parsed.error };
  }

  const { report, children } = parsed;
  const deviceId = report.deviceId;

  const rl = consumeRateLimit(`tv-report:${deviceId}`, 1, 15_000, nowMs);
  if (!rl.ok) {
    return { ok: false, status: 429, retryAfterSec: rl.retryAfterSec };
  }

  const db = opts?.dbOverride ?? supabaseAdmin();
  if (!db) {
    return { ok: false, status: 503, error: "no database" };
  }

  const { data: parentRow } = await db
    .from("tv_devices")
    .select("id, property_id")
    .eq("id", deviceId)
    .maybeSingle();

  if (!parentRow?.property_id) {
    return { ok: false, status: 404 };
  }

  const parentPropertyId = parentRow.property_id as string;
  const receivedAt = new Date(nowMs).toISOString();
  const updates: PersistReportInput[] = [
    { deviceId, report, receivedAt },
  ];
  const touched = new Set<string>([deviceId]);

  let rejectedChildren = 0;
  if (children.length > 0) {
    const childIds = children.map((c) => c.deviceId).filter((id) => UUID_RE.test(id));
    const { data: childRows } = await db
      .from("tv_devices")
      .select("id, property_id")
      .in("id", childIds.length ? childIds : ["00000000-0000-4000-8000-000000000000"]);

    const byId = new Map(
      (childRows ?? []).map((r) => [r.id as string, r.property_id as string | null])
    );

    for (const child of children) {
      const cid = child.deviceId;
      const prop = byId.get(cid);
      if (!prop || prop !== parentPropertyId) {
        rejectedChildren += 1;
        continue;
      }
      updates.push({
        deviceId: cid,
        report: child,
        parentDeviceId: deviceId,
        receivedAt,
      });
      touched.add(cid);
    }
  }

  const persist = await persistDeviceReports(updates, undefined, db);
  if (!persist.ok) {
    return { ok: false, status: 503, error: persist.error };
  }

  await touchDeviceLastSeen([...touched]);

  return {
    ok: true,
    nextReportS: NEXT_REPORT_S,
    rejectedChildren,
  };
}
