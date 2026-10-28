/**
 * Extra guard on POST /api/tv/report reject paths (404/400/413/503) — per-IP,
 * in-memory, best-effort across one serverless instance (F-3160 / F-3248).
 *
 * Per-IP keys use the first x-forwarded-for hop (see route clientIp) — on Vercel
 * that is the connecting client; behind other proxies, configure trust accordingly.
 */

import { consumeRateLimit, peekRateLimit } from "./in-memory-rate-limit.ts";

const REJECT_MAX_PER_IP = 60;
const REJECT_GLOBAL_MAX = 400;
const REJECT_WINDOW_MS = 60_000;

function rejectBudgetKeys(clientIp: string): { ip: string; ipKey: string } {
  const ip = clientIp.trim() || "unknown";
  return { ip, ipKey: `tv-report-reject:${ip}` };
}

/** True when the next reject would hit 429 — checked before tv_devices lookup (F-3265). */
export function isReportRejectBudgetExhausted(
  clientIp: string,
  nowMs: number = Date.now()
): { exhausted: false } | { exhausted: true; retryAfterSec: number } {
  const { ipKey } = rejectBudgetKeys(clientIp);
  const global = peekRateLimit(
    "tv-report-reject:global",
    REJECT_GLOBAL_MAX,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!global.ok) return { exhausted: true, retryAfterSec: global.retryAfterSec };
  const perIp = peekRateLimit(
    ipKey,
    REJECT_MAX_PER_IP,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!perIp.ok) return { exhausted: true, retryAfterSec: perIp.retryAfterSec };
  return { exhausted: false };
}

/** Per-IP + global guard on 404/400/413 reject paths (single instance, F-3160). */
export function consumeReportRejectBudget(
  clientIp: string,
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  const { ipKey } = rejectBudgetKeys(clientIp);
  const global = consumeRateLimit(
    "tv-report-reject:global",
    REJECT_GLOBAL_MAX,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!global.ok) return global;
  return consumeRateLimit(
    ipKey,
    REJECT_MAX_PER_IP,
    REJECT_WINDOW_MS,
    nowMs
  );
}
