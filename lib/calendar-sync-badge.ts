/** Multi-calendar Guesty freshness — only trusts app_config guesty_last_sync_at. */

export const GUESTY_SYNC_STALE_MS = 60 * 60 * 1000;

export function guestySyncBadge(
  lastSyncedAt: string | null | undefined,
  nowMs: number,
  staleAfterMs = GUESTY_SYNC_STALE_MS
): { syncStale: boolean; lastSyncedLabel: string } {
  const parsedMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : NaN;
  const validSync = Boolean(lastSyncedAt) && !Number.isNaN(parsedMs);
  const syncStale =
    !validSync || nowMs - parsedMs > staleAfterMs;
  const lastSyncedLabel = validSync
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(parsedMs))
    : "unknown";
  return { syncStale, lastSyncedLabel };
}
