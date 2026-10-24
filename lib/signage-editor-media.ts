/**
 * Signage editor media guards + dropped-oversized UX (F-1031).
 */

export type SignageMediaInsertAsset = {
  url: string;
  type: "image" | "video";
  tooLargeForTv?: boolean;
};

export const DROPPED_OVERSIZED_STORAGE_KEY = "fh_signage_dropped_oversized";

export function canInsertSignageMedia(asset: SignageMediaInsertAsset): boolean {
  if (asset.tooLargeForTv) return false;
  return true;
}

export function formatDroppedOversizedNotice(
  dropped: { key: string; name: string }[],
  action: "publish" | "restore"
): string {
  const names = dropped.map((d) => d.name || d.key).join(", ");
  const verb = action === "restore" ? "Restore" : "Publish";
  return `${verb} saved, but removed oversized TV videos (not rotated): ${names}.`;
}

export function publishDroppedOversizedSuffix(data: {
  droppedOversized?: { key: string; name: string }[] | null;
}): string {
  if (!Array.isArray(data.droppedOversized) || data.droppedOversized.length === 0) {
    return "";
  }
  return ` ${formatDroppedOversizedNotice(data.droppedOversized, "publish")}`;
}

/** JSON string for sessionStorage after restore, or null when nothing to save. */
export function restoreDroppedOversizedStorageValue(
  dropped: { key: string; name: string }[] | null | undefined
): string | null {
  if (!Array.isArray(dropped) || dropped.length === 0) return null;
  return JSON.stringify(dropped);
}

export function restoreDroppedNoticeFromStorage(
  raw: string | null
): { key: string; name: string }[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as { key: string; name: string }[];
  } catch {
    return null;
  }
}

export function restoreSuccessMessageFromStorage(raw: string | null): string | null {
  const dropped = restoreDroppedNoticeFromStorage(raw);
  if (!dropped) return null;
  return `${formatDroppedOversizedNotice(dropped, "restore")} TVs update in ~10 seconds.`;
}
