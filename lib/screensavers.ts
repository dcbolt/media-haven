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

function envScreensavers(): ScreensaverAsset[] {
  return (process.env.SCREENSAVER_URLS ?? "")
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
  const [repo, storage] = await Promise.all([
    repoScreensavers(),
    storageScreensavers(propertyId),
  ]);
  return [...envScreensavers(), ...repo, ...storage];
}
