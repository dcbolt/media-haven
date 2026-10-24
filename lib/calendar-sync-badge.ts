/** Multi-calendar Guesty freshness — only trusts app_config guesty_last_sync_at. */

export const GUESTY_SYNC_STALE_MS = 60 * 60 * 1000;

export function guestySyncBadge(
  lastSyncedAt: string | null | undefined,
  nowMs: number,
  staleAfterMs = GUESTY_SYNC_STALE_MS
): { syncStale: boolean; lastSyncedLabel: string } {
  const syncStale =
    !lastSyncedAt ||
    Number.isNaN(new Date(lastSyncedAt).getTime()) ||
    nowMs - new Date(lastSyncedAt).getTime() > staleAfterMs;
  const lastSyncedLabel = lastSyncedAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(lastSyncedAt))
    : "unknown";
  return { syncStale, lastSyncedLabel };
}
