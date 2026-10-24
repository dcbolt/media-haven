/**
 * Pure Blob listing helpers (Node smoke safe).
 */

import path from "path";
import type { ScreensaverAsset } from "./screensavers-types";

/** Aligned with media-upload-limits.ts — inlined for Node 22 ESM smokes (F-988 class). */
const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

/** Stay well under the ~8s TV screensaver fetch budget (F-990). */
export const BLOB_LIST_TIME_BUDGET_MS = 5_500;
export const BLOB_LIST_MAX_PAGES = 80;

function classifyByExtension(name: string): ScreensaverAsset["type"] | null {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

/** Prefer Blob contentType; fall back to pathname extension (F-994). */
export function classifyBlobMedia(
  pathname: string,
  contentType?: string | null
): ScreensaverAsset["type"] | null {
  const mime = (contentType ?? "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return classifyByExtension(pathname);
}

export type BlobLike = {
  pathname: string;
  url: string;
  size: number;
  contentType?: string | null;
};

export function mapBlobRowsToAssets(blobs: BlobLike[]): ScreensaverAsset[] {
  const out: ScreensaverAsset[] = [];
  for (const b of blobs) {
    const type = classifyBlobMedia(b.pathname, b.contentType);
    if (!type) continue;
    if (type === "video" && b.size > MAX_TV_VIDEO_BYTES) {
      out.push({ url: b.url, type, tooLargeForTv: true });
    } else {
      out.push({ url: b.url, type });
    }
  }
  return out;
}

export type FetchAllBlobRowsResult = {
  rows: BlobLike[];
  partial: boolean;
};

export async function fetchAllBlobRows(
  listPage: (cursor?: string) => Promise<{
    blobs: BlobLike[];
    cursor?: string;
    hasMore: boolean;
  }>,
  opts?: {
    deadlineMs?: number;
    maxPages?: number;
    now?: () => number;
  }
): Promise<FetchAllBlobRowsResult> {
  const now = opts?.now ?? (() => Date.now());
  const deadline = now() + (opts?.deadlineMs ?? BLOB_LIST_TIME_BUDGET_MS);
  const maxPages = opts?.maxPages ?? BLOB_LIST_MAX_PAGES;
  const out: BlobLike[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    if (now() >= deadline) {
      partial = true;
      break;
    }
    if (cursor) {
      if (seenCursors.has(cursor)) {
        partial = true;
        break;
      }
      seenCursors.add(cursor);
    }
    const pageResult = await listPage(cursor);
    out.push(...pageResult.blobs);
    if (!pageResult.hasMore) break;
    if (!pageResult.cursor) {
      partial = true;
      break;
    }
    cursor = pageResult.cursor;
    if (page === maxPages - 1) partial = true;
  }

  return { rows: out, partial };
}
