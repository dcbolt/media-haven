/**
 * Default / env standby videos — must never be deleted from host media UI.
 */

export const DEFAULT_STANDBY_SCREENSAVER_URL =
  "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/drone_dunes_v2_smooth.mp4";

export function protectedStandbyScreensaverUrls(): Set<string> {
  const raw = process.env.SCREENSAVER_URLS ?? DEFAULT_STANDBY_SCREENSAVER_URL;
  const urls = raw
    .split(",")
    .map((entry) => entry.trim().split("|")[0]?.trim())
    .filter((u): u is string => Boolean(u && u.startsWith("https://")));
  return new Set(urls.length > 0 ? urls : [DEFAULT_STANDBY_SCREENSAVER_URL]);
}

export function isProtectedStandbyScreensaverUrl(url: string): boolean {
  return protectedStandbyScreensaverUrls().has(url);
}
