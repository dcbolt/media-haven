/**
 * Pure Blob listing helpers (Node smoke safe).
 */

import path from "path";
import type { ScreensaverAsset } from "./screensavers-types";

/** Aligned with media-upload-limits.ts — inlined for Node 22 ESM smokes (F-988 class). */
const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

function classify(name: string): ScreensaverAsset["type"] | null {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

type BlobLike = { pathname: string; url: string; size: number };

export function mapBlobRowsToAssets(blobs: BlobLike[]): ScreensaverAsset[] {
  const out: ScreensaverAsset[] = [];
  for (const b of blobs) {
    const type = classify(b.pathname);
    if (!type) continue;
    if (type === "video" && b.size > MAX_TV_VIDEO_BYTES) {
      out.push({ url: b.url, type, tooLargeForTv: true });
    } else {
      out.push({ url: b.url, type });
    }
  }
  return out;
}

export async function fetchAllBlobRows(
  listPage: (cursor?: string) => Promise<{
    blobs: BlobLike[];
    cursor?: string;
    hasMore: boolean;
  }>
): Promise<BlobLike[]> {
  const out: BlobLike[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await listPage(cursor);
    out.push(...page.blobs);
    if (!page.hasMore) break;
    cursor = page.cursor;
    if (!cursor) break;
  }
  return out;
}
