/**
 * Pure Blob listing helpers (Node smoke safe).
 */

import path from "path";
import type { ScreensaverAsset } from "./screensavers-types";
import { MAX_TV_VIDEO_BYTES } from "./tv-video-byte-cap.ts";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

/** Stay well under the ~8s TV screensaver fetch budget (F-990). */
export const BLOB_LIST_TIME_BUDGET_MS = 5_500;
export const BLOB_LIST_MAX_PAGES = 80;

export type BlobListPartialReason =
  | "time_budget"
  | "page_cap"
  | "repeated_cursor"
  | "missing_cursor";

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
  uploadedAt?: string;
};

export function mapBlobRowsToAssets(blobs: BlobLike[]): ScreensaverAsset[] {
  const out: ScreensaverAsset[] = [];
  for (const b of blobs) {
    const type = classifyBlobMedia(b.pathname, b.contentType);
    if (!type) continue;
    const name = path.basename(b.pathname);
    const addedAt = b.uploadedAt;
    if (type === "video" && b.size > MAX_TV_VIDEO_BYTES) {
      out.push({
        url: b.url,
        type,
        tooLargeForTv: true,
        bytes: b.size,
        name,
        addedAt,
      });
    } else {
      out.push({
        url: b.url,
        type,
        name,
        addedAt,
        ...(type === "video" ? { bytes: b.size } : {}),
      });
    }
  }
  return out;
}

export type FetchAllBlobRowsResult = {
  rows: BlobLike[];
  partial: boolean;
  partialReason?: BlobListPartialReason;
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
  let partialReason: BlobListPartialReason | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    if (now() >= deadline) {
      partial = true;
      partialReason = "time_budget";
      break;
    }
    if (cursor) {
      if (seenCursors.has(cursor)) {
        partial = true;
        partialReason = "repeated_cursor";
        break;
      }
      seenCursors.add(cursor);
    }
    const pageResult = await listPage(cursor);
    out.push(...pageResult.blobs);
    if (!pageResult.hasMore) break;
    if (!pageResult.cursor) {
      partial = true;
      partialReason = "missing_cursor";
      break;
    }
    cursor = pageResult.cursor;
    if (page === maxPages - 1) {
      partial = true;
      partialReason = "page_cap";
    }
  }

  return { rows: out, partial, partialReason };
}
