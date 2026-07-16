import { list } from "@vercel/blob";
import { readdir } from "fs/promises";
import path from "path";
import { supabaseAdmin } from "./supabase";

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

export interface ScreensaverAsset {
  url: string;
  type: "image" | "video";
}

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
  for (const prefix of prefixes) {
    const { data } = await db.storage.from("screensavers").list(prefix, {
      limit: 50,
      sortBy: { column: "name", order: "asc" },
    });
    for (const file of data ?? []) {
      const type = classify(file.name);
      if (!type) continue;
      const { data: pub } = db.storage
        .from("screensavers")
        .getPublicUrl(`${prefix}/${file.name}`);
      assets.push({ url: pub.publicUrl, type });
    }
  }
  return assets;
}

async function blobScreensavers(): Promise<ScreensaverAsset[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  try {
    // No prefix: dashboard uploads land at the store root, the in-app
    // uploader writes under screensavers/. classify() filters non-media.
    const { blobs } = await list({ limit: 100 });
    return blobs
      .map((b) => {
        const type = classify(b.pathname);
        return type ? { url: b.url, type } : null;
      })
      .filter((a): a is ScreensaverAsset => a !== null);
  } catch {
    return []; // storage hiccup — TVs fall back to remaining sources
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
 * Drive's direct-download endpoint — keep them under ~100 MB each so Google
 * skips the virus-scan interstitial that would break <video> playback.
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
        if (f.mimeType.startsWith("video/")) {
          return {
            url: `https://drive.google.com/uc?export=download&id=${f.id}`,
            type: "video",
          };
        }
        return null; // docs, folders, etc. — not media
      })
      .filter((a): a is ScreensaverAsset => a !== null);
    driveCache = { at: Date.now(), assets };
    return assets;
  } catch {
    return driveCache?.assets ?? []; // Drive hiccup — keep last good listing
  }
}

// The Dunes drone edit — the brand-default standby media, host-uploaded to
// Vercel Blob. SCREENSAVER_URLS overrides; blob/repo/bucket media adds to it.
const DEFAULT_SCREENSAVER_URLS =
  "https://rys7rywziucawk51.public.blob.vercel-storage.com/drone_edit_dunes_7.17.mp4";

function envScreensavers(): ScreensaverAsset[] {
  return (process.env.SCREENSAVER_URLS ?? DEFAULT_SCREENSAVER_URLS)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => {
      const type = classify(new URL(url, "https://x").pathname);
      return type ? { url, type } : null;
    })
    .filter((a): a is ScreensaverAsset => a !== null);
}

export async function listScreensavers(
  propertyId: string | null
): Promise<ScreensaverAsset[]> {
  const [repo, storage, blob, drive] = await Promise.all([
    repoScreensavers(),
    storageScreensavers(propertyId),
    blobScreensavers(),
    driveScreensavers(),
  ]);
  // Dedupe by URL — the default blob URL also appears in the store listing
  // once the store is connected to the project.
  const seen = new Set<string>();
  return [...envScreensavers(), ...drive, ...blob, ...repo, ...storage].filter(
    (a) => (seen.has(a.url) ? false : (seen.add(a.url), true))
  );
}
