import { del } from "@vercel/blob";
import { blobToken } from "./blob-token";
import { canPurgeBlobAtSource } from "./media-library";
import {
  MEDIA_TRASH_RETENTION_MS,
  type MediaMetaMap,
  upsertMediaMeta,
} from "./media-meta";

export function trashEntriesReadyForPurge(
  map: MediaMetaMap,
  now = Date.now()
): string[] {
  const cutoff = now - MEDIA_TRASH_RETENTION_MS;
  const out: string[] = [];
  for (const [url, e] of Object.entries(map)) {
    if (!e.trashedAt || !canPurgeBlobAtSource(url)) continue;
    const t = Date.parse(e.trashedAt);
    if (Number.isFinite(t) && t <= cutoff) out.push(url);
  }
  return out;
}

/** Permanently delete Blob bytes + drop meta row. */
export async function purgeTrashedBlobUrl(
  url: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canPurgeBlobAtSource(url)) {
    return { ok: false, error: "not a blob asset" };
  }
  const token = blobToken();
  if (!token) return { ok: false, error: "blob not configured" };
  try {
    await del(url, { token });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "blob delete failed" };
  }
  const cleared = await upsertMediaMeta(url, {
    title: null,
    tags: [],
    expiresAt: null,
    startsAt: null,
    trashedAt: null,
    hidden: null,
    createdAt: null,
    sizeBytes: null,
  });
  if (!cleared.ok) return cleared;
  return { ok: true };
}
