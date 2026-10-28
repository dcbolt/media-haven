/**
 * Extra guard on POST /api/tv/report reject paths (404/400/413) — per-IP,
 * in-memory, best-effort across one serverless instance (F-3160).
 */

import { consumeRateLimit } from "./in-memory-rate-limit.ts";

const REJECT_MAX_PER_IP = 60;
const REJECT_GLOBAL_MAX = 400;
const REJECT_WINDOW_MS = 60_000;

/** Per-IP + global guard on 404/400/413 reject paths (single instance, F-3160). */
export function consumeReportRejectBudget(
  clientIp: string,
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  const ip = clientIp.trim() || "unknown";
  const global = consumeRateLimit(
    "tv-report-reject:global",
    REJECT_GLOBAL_MAX,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!global.ok) return global;
  return consumeRateLimit(
    `tv-report-reject:${ip}`,
    REJECT_MAX_PER_IP,
    REJECT_WINDOW_MS,
    nowMs
  );
}
