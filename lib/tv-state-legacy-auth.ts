export const TV_STATE_LEGACY_AUTH_THROTTLE_MS = 60 * 60 * 1000;

/** MH186-15b: at most one `last_legacy_auth_at` write per hour per device. */
export function shouldWriteLastLegacyAuthAt(
  lastLegacyAuthAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!lastLegacyAuthAt) return true;
  const prev = new Date(lastLegacyAuthAt).getTime();
  if (Number.isNaN(prev)) return true;
  return nowMs - prev >= TV_STATE_LEGACY_AUTH_THROTTLE_MS;
}