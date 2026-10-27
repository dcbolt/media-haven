import { list } from "@vercel/blob";
import { readdir } from "fs/promises";
import path from "path";
import {
  BLOB_LIST_TIME_BUDGET_MS,
  classifyBlobMedia,
  fetchAllBlobRows,
  mapBlobRowsToAssets,
} from "./screensavers-blob-list";
import { MAX_TV_VIDEO_BYTES } from "./media-upload-limits";
import {
  type ListScreensaversOptions,
  type ScreensaverAsset,
} from "./screensavers-types";
import { blobConfigured, blobStoreId, blobToken } from "./blob-token";
import { supabaseAdmin } from "./supabase";

export type { ListScreensaversOptions, ScreensaverAsset } from "./screensavers-types";
export { MAX_TV_VIDEO_BYTES } from "./media-upload-limits";
export { fetchAllBlobRows, mapBlobRowsToAssets } from "./screensavers-blob-list";

/**
 * Standby-screen media. Two sources, merged:
 *
 * 1. Repo files in public/screensavers/ — zero setup, deployed with the app.
 *    Good for a shared brand set. Keep videos small here (Vercel serves
 *    static assets, but the repo shouldn't carry gigabytes).
 * 2. Supabase Storage bucket "screensavers" (public) — for full-res 4K
 *    photos and large videos, uploadable from the Supabase dashboard without
 *    a deploy. Files under a property-id prefix show only on that property's
 *    TVs; files under shared/ show everywhere.
 * 3. SCREENSAVER_URLS env var — comma-separated public URLs (e.g. Vercel
 *    Blob). Listed first, so these are the default/priority media. Lets the
 *    host wire up media hosted anywhere without a schema or a deploy.
 * 4. Google Drive folder (GDRIVE_MEDIA_FOLDER_ID + GOOGLE_API_KEY) — the
 *    team's existing media library, no storage caps. Drop files in the
 *    folder and they join the rotation within a minute, no deploy.
 */

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);

function classify(name: string): ScreensaverAsset["type"] | null {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

async function repoScreensavers(): Promise<ScreensaverAsset[]> {
  try {
    const dir = path.join(process.cwd(), "public", "screensavers");
    const files = await readdir(dir);
    return files
      .map((f) => {
        const type = classify(f);
        return type ? { url: `/screensavers/${f}`, type } : null;
      })
      .filter((a): a is ScreensaverAsset => a !== null)
      .sort((a, b) => a.url.localeCompare(b.url));
  } catch {
    return []; // directory absent — that's fine
  }
}

async function storageScreensavers(
  propertyId: string | null
): Promise<ScreensaverAsset[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const prefixes = propertyId ? ["shared", propertyId] : ["shared"];
  const assets: ScreensaverAsset[] = [];
  const pageSize = 100;
  const deadline = Date.now() + BLOB_LIST_TIME_BUDGET_MS;
  const seenCursors = new Set<string>();

  for (const prefix of prefixes) {
    let cursor: string | undefined;
    let pages = 0;
    while (pages < 80 && Date.now() < deadline) {
      pages += 1;
      if (cursor) {
        if (seenCursors.has(cursor)) break;
        seenCursors.add(cursor);
      }
      const { data, error } = await db.storage.from("screensavers").listV2({
        prefix: `${prefix}/`,
        limit: pageSize,
        cursor,
      });
      if (error || !data) break;
      for (const file of data.objects ?? []) {
        if (!file.name || file.id === null) continue;
        const mime =
          typeof file.metadata?.mimetype === "string"
            ? file.metadata.mimetype
            : typeof file.metadata?.contentType === "string"
              ? file.metadata.contentType
              : "";
        const type = classifyBlobMedia(file.name, mime);
        if (!type) continue;
        const size =
          typeof file.metadata?.size === "number" ? file.metadata.size : 0;
        const { data: pub } = db.storage
          .from("screensavers")
          .getPublicUrl(`${prefix}/${file.name}`);
        if (type === "video" && size > MAX_TV_VIDEO_BYTES) {
          assets.push({
            url: pub.publicUrl,
            type,
            tooLargeForTv: true,
            bytes: size,
          });
        } else {
          assets.push({
            url: pub.publicUrl,
            type,
            ...(type === "video" && size > 0 ? { bytes: size } : {}),
          });
        }
      }
      if (!data.hasNext || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
  }
  return assets;
}

// Every TV poll calls listScreensavers; without a cache each poll is a
// billable blob "advanced operation" (observed 237→5.8k within an hour of
// OIDC listing going live). Same memo pattern as the Drive listing.
const BLOB_TTL_MS = 60_000;
let blobCache: { at: number; assets: ScreensaverAsset[] } | null = null;

export function invalidateBlobScreensaverCache(): void {
  blobCache = null;
}

async function blobScreensavers(bypassCache = false): Promise<ScreensaverAsset[]> {
  if (!blobConfigured()) return [];
  if (
    !bypassCache &&
    blobCache &&
    Date.now() - blobCache.at < BLOB_TTL_MS
  ) {
    return blobCache.assets;
  }
  try {
    const { rows: blobs, partial, partialReason } = await fetchAllBlobRows(
      async (cursor) => {
      const page = await list({
        limit: 100,
        cursor,
        prefix: "screensavers/",
        token: blobToken(),
        storeId: blobStoreId(),
      });
      return {
        blobs: page.blobs.map((b) => {
          const contentType =
            "contentType" in b &&
            typeof (b as { contentType?: unknown }).contentType === "string"
              ? (b as { contentType: string }).contentType
              : undefined;
          return {
            pathname: b.pathname,
            url: b.url,
            size: b.size,
            contentType,
          };
        }),
        cursor: page.cursor,
        hasMore: page.hasMore,
      };
      }
    );
    if (partial) {
      console.warn(
        "[screensavers] blob listing truncated",
        partialReason ?? "unknown"
      );
    }
    const assets = mapBlobRowsToAssets(blobs);
    blobCache = { at: Date.now(), assets };
    return assets;
  } catch {
    return blobCache?.assets ?? []; // storage hiccup — keep last good listing
  }
}

/**
 * Google Drive as the media library. Requirements, both set in Vercel env:
 * - GDRIVE_MEDIA_FOLDER_ID: the part after /folders/ in the folder URL. The
 *   folder must be shared "Anyone with the link — Viewer" (listing uses a
 *   plain API key, and TVs hotlink the files without auth).
 * - GOOGLE_API_KEY: a Google Cloud API key with the Drive API enabled.
 *
 * Images serve through googleusercontent at 4K width. Videos stream via
 * drive.usercontent.google.com with confirm=t, which serves any size with
 * Range support (the older uc?export=download endpoint interposed a
 * virus-scan HTML page for files over ~100 MB, breaking <video> playback).
 * Listing is memoized briefly so 30s TV polls don't hammer the Drive API,
 * and the last good listing survives a Drive hiccup.
 */
const DRIVE_TTL_MS = 60_000;
let driveCache: { at: number; assets: ScreensaverAsset[] } | null = null;

export function driveConfigured(): boolean {
  return Boolean(
    process.env.GDRIVE_MEDIA_FOLDER_ID && process.env.GOOGLE_API_KEY
  );
}

async function driveScreensavers(): Promise<ScreensaverAsset[]> {
  const folder = process.env.GDRIVE_MEDIA_FOLDER_ID;
  const key = process.env.GOOGLE_API_KEY;
  if (!folder || !key) return [];
  if (driveCache && Date.now() - driveCache.at < DRIVE_TTL_MS) {
    return driveCache.assets;
  }
  try {
    const q = encodeURIComponent(`'${folder}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&orderBy=name&pageSize=100&key=${key}`,
      { cache: "no-store" }
    );
    if (!res.ok) return driveCache?.assets ?? [];
    const data = (await res.json()) as {
      files?: { id: string; name: string; mimeType: string }[];
    };
    const assets = (data.files ?? [])
      .map((f): ScreensaverAsset | null => {
        if (f.mimeType.startsWith("image/")) {
          return {
            url: `https://lh3.googleusercontent.com/d/${f.id}=w3840`,
            type: "image",
          };
        }
        return null;
      })
      .filter((a): a is ScreensaverAsset => a !== null);
    driveCache = { at: Date.now(), assets };
    return assets;
  } catch {
    return driveCache?.assets ?? [];
  }
}

const DEFAULT_SCREENSAVER_URLS =
  "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/drone_dunes_v2_smooth.mp4";

function envScreensavers(): ScreensaverAsset[] {
  return (process.env.SCREENSAVER_URLS ?? DEFAULT_SCREENSAVER_URLS)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, hint] = entry.split("|");
      const type =
        hint === "video" || hint === "image"
          ? hint
          : classify(new URL(url, "https://x").pathname);
      return type && url ? { url, type } : null;
    })
    .filter((a): a is ScreensaverAsset => a !== null);
}

function filterForRotation(
  assets: ScreensaverAsset[],
  opts?: ListScreensaversOptions
): ScreensaverAsset[] {
  if (opts?.includeOversized) return assets;
  return assets.filter((a) => !a.tooLargeForTv);
}

export async function listScreensavers(
  propertyId: string | null,
  opts?: ListScreensaversOptions
): Promise<ScreensaverAsset[]> {
  const [repo, storage, blob, drive] = await Promise.all([
    repoScreensavers(),
    storageScreensavers(propertyId),
    blobScreensavers(Boolean(opts?.bypassBlobCache)),
    driveScreensavers(),
  ]);
  const seen = new Set<string>();
  const merged = [
    ...envScreensavers(),
    ...drive,
    ...filterForRotation(blob, opts),
    ...repo,
    ...storage,
  ].filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  return merged;
}

/** Admin: all blob rows including oversized (for /host/media inventory). */
export async function listScreensaversIncludingOversized(
  propertyId: string | null,
  bypassBlobCache = false
): Promise<ScreensaverAsset[]> {
  if (!blobConfigured()) {
    return listScreensavers(propertyId, { includeOversized: true });
  }
  const [repo, storage, blob, drive] = await Promise.all([
    repoScreensavers(),
    storageScreensavers(propertyId),
    blobScreensavers(bypassBlobCache),
    driveScreensavers(),
  ]);
  const seen = new Set<string>();
  return [
    ...envScreensavers(),
    ...drive,
    ...blob,
    ...repo,
    ...storage,
  ].filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
}

export async function screensaverListingContainsUrl(
  url: string,
  propertyId: string | null = null
): Promise<boolean> {
  invalidateBlobScreensaverCache();
  const all = await listScreensaversIncludingOversized(propertyId, true);
  return all.some((a) => a.url === url);
}
