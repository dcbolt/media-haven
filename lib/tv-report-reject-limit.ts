/**
 * Extra guard on POST /api/tv/report reject paths (404/400/413/503) — per-IP,
 * in-memory, best-effort across one serverless instance (F-3160 / F-3248 / F-3301).
 *
 * Per-IP keys use the first x-forwarded-for hop (see route clientIp) — on Vercel
 * that is the connecting client; behind other proxies, configure trust accordingly.
 *
 * Global budget applies only to unknown/unclaimed 404 rejects after tv_devices lookup.
 * Malformed bodies and claimed-device errors consume per-IP budget only.
 */

import { consumeRateLimit, peekRateLimit } from "./in-memory-rate-limit.ts";

const REJECT_MAX_PER_IP = 60;
const REJECT_GLOBAL_MAX = 400;
const REJECT_WINDOW_MS = 60_000;
const GLOBAL_KEY = "tv-report-reject:global";

function rejectBudgetKeys(clientIp: string): { ip: string; ipKey: string } {
  const ip = clientIp.trim() || "unknown";
  return { ip, ipKey: `tv-report-reject:${ip}` };
}

/** Pre–tv_devices lookup: per-IP only (F-3301). */
export function isPerIpRejectBudgetExhausted(
  clientIp: string,
  nowMs: number = Date.now()
): { exhausted: false } | { exhausted: true; retryAfterSec: number } {
  const { ipKey } = rejectBudgetKeys(clientIp);
  const perIp = peekRateLimit(
    ipKey,
    REJECT_MAX_PER_IP,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!perIp.ok) return { exhausted: true, retryAfterSec: perIp.retryAfterSec };
  return { exhausted: false };
}

/** @deprecated Use isPerIpRejectBudgetExhausted — global is not checked pre-lookup. */
export function isReportRejectBudgetExhausted(
  clientIp: string,
  nowMs: number = Date.now()
): { exhausted: false } | { exhausted: true; retryAfterSec: number } {
  return isPerIpRejectBudgetExhausted(clientIp, nowMs);
}

export type ConsumeRejectBudgetOptions = {
  /** When true, also consume global budget (404 unknown/unclaimed only). */
  chargeGlobal?: boolean;
};

/** Per-IP first; global only when chargeGlobal and per-IP passed (F-3301). */
export function consumeReportRejectBudget(
  clientIp: string,
  nowMs: number = Date.now(),
  options?: ConsumeRejectBudgetOptions
): { ok: true } | { ok: false; retryAfterSec: number } {
  const { ipKey } = rejectBudgetKeys(clientIp);
  const perIp = consumeRateLimit(
    ipKey,
    REJECT_MAX_PER_IP,
    REJECT_WINDOW_MS,
    nowMs
  );
  if (!perIp.ok) return perIp;
  if (options?.chargeGlobal) {
    return consumeRateLimit(
      GLOBAL_KEY,
      REJECT_GLOBAL_MAX,
      REJECT_WINDOW_MS,
      nowMs
    );
  }
  return { ok: true };
}

export function consumeGlobalRejectBudget(
  nowMs: number = Date.now()
): { ok: true } | { ok: false; retryAfterSec: number } {
  return consumeRateLimit(
    GLOBAL_KEY,
    REJECT_GLOBAL_MAX,
    REJECT_WINDOW_MS,
    nowMs
  );
}
