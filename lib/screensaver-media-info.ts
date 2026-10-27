/**
 * Host media library: readable names, source labels, delete eligibility.
 */

import {
  classifyScreensaverDeleteStorage,
  hostnameMatchesSuffix,
} from "./screensaver-delete-url.ts";
import { isProtectedStandbyScreensaverUrl } from "./screensaver-standby.ts";
import { storagePathFromAllowedPublicUrl } from "./supabase-screensaver-upload-enforce.ts";
import type { ScreensaverAsset } from "./screensavers-types.ts";

export type ScreensaverMediaSource =
  | "upload"
  | "google_drive"
  | "supabase"
  | "repo"
  | "env";

export type ScreensaverMediaItem = ScreensaverAsset & {
  name: string;
  source: ScreensaverMediaSource;
  sourceLabel: string;
  driveFileId?: string;
  /** ISO timestamp when known (Blob uploadedAt). */
  addedAt?: string;
  hiddenFromRotation?: boolean;
  protectedStandby?: boolean;
  /** Host can permanently delete stored uploads (Blob/Supabase). */
  deletable: boolean;
  /** Drive items hide instead of delete. */
  hideable: boolean;
};

const BLOB_HOST_SUFFIXES = [
  "public.blob.vercel-storage.com",
  "blob.vercel-storage.com",
] as const;
const DRIVE_IMAGE_RE =
  /^https:\/\/lh3\.googleusercontent\.com\/d\/([^/=]+)/i;
const DRIVE_USERCONTENT_RE =
  /^https:\/\/drive\.usercontent\.google\.com\//i;

export function driveFileIdFromUrl(url: string): string | null {
  const m = url.match(DRIVE_IMAGE_RE);
  if (m?.[1]) return m[1];
  try {
    const u = new URL(url);
    if (DRIVE_USERCONTENT_RE.test(url)) {
      const id = u.searchParams.get("id");
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isGoogleDriveScreensaverUrl(url: string): boolean {
  if (DRIVE_IMAGE_RE.test(url)) return true;
  try {
    const u = new URL(url);
    return (
      DRIVE_USERCONTENT_RE.test(url) &&
      Boolean(u.searchParams.get("id"))
    );
  } catch {
    return false;
  }
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function fileNameFromPath(pathOrUrl: string): string {
  try {
    const u = new URL(pathOrUrl, "https://x");
    const base = u.pathname.split("/").filter(Boolean).pop() ?? pathOrUrl;
    return decodeURIComponent(base);
  } catch {
    const parts = pathOrUrl.split("/").filter(Boolean);
    return decodeURIComponent(parts.pop() ?? pathOrUrl);
  }
}

export function detectScreensaverSource(url: string): ScreensaverMediaSource {
  if (url.startsWith("/screensavers/")) return "repo";
  if (isGoogleDriveScreensaverUrl(url)) return "google_drive";
  if (storagePathFromAllowedPublicUrl(url)) return "supabase";
  try {
    const host = new URL(url).hostname;
    if (BLOB_HOST_SUFFIXES.some((s) => hostnameMatchesSuffix(host, s))) {
      return "upload";
    }
  } catch {
    /* ignore */
  }
  return "env";
}

export function sourceLabel(source: ScreensaverMediaSource): string {
  switch (source) {
    case "upload":
      return "Upload";
    case "google_drive":
      return "Google Drive";
    case "supabase":
      return "Supabase";
    case "repo":
      return "Bundled";
    case "env":
      return "Default";
    default:
      return "Unknown";
  }
}

export function displayNameForScreensaverUrl(
  url: string,
  source: ScreensaverMediaSource,
  hint?: string
): string {
  if (hint?.trim()) return hint.trim();
  if (source === "google_drive") {
    const id = driveFileIdFromUrl(url);
    return id ? `Drive ${id.slice(0, 8)}…` : "Drive file";
  }
  if (source === "supabase") {
    const path = storagePathFromAllowedPublicUrl(url);
    if (path) {
      const base = path.split("/").pop();
      if (base) return decodeURIComponent(base);
    }
  }
  if (source === "upload") {
    try {
      const u = new URL(url);
      const marker = "/screensavers/";
      const idx = u.pathname.indexOf(marker);
      if (idx >= 0) {
        const rest = u.pathname.slice(idx + marker.length);
        const base = rest.split("/").pop();
        if (base) return decodeURIComponent(base);
      }
    } catch {
      /* fall through */
    }
  }
  return fileNameFromPath(url);
}

export function enrichScreensaverAsset(
  asset: ScreensaverAsset,
  opts?: {
    hiddenFromRotation?: boolean;
    protectedStandby?: boolean;
    name?: string;
    driveFileId?: string;
    addedAt?: string;
  }
): ScreensaverMediaItem {
  const source = detectScreensaverSource(asset.url);
  const protectedStandby =
    opts?.protectedStandby ?? isProtectedStandbyScreensaverUrl(asset.url);
  const deletable =
    !protectedStandby &&
    (source === "upload" || source === "supabase") &&
    classifyScreensaverDeleteStorage(asset.url) !== null;
  const hideable = source === "google_drive";
  return {
    ...asset,
    name: displayNameForScreensaverUrl(
      asset.url,
      source,
      opts?.name ?? asset.name
    ),
    source,
    sourceLabel: sourceLabel(source),
    driveFileId: opts?.driveFileId ?? driveFileIdFromUrl(asset.url) ?? undefined,
    addedAt: opts?.addedAt,
    hiddenFromRotation: opts?.hiddenFromRotation,
    protectedStandby,
    deletable,
    hideable,
  };
}

export function isVercelBlobScreensaverUrl(url: string): boolean {
  return detectScreensaverSource(url) === "upload";
}

export function isSupabaseScreensaverUrl(url: string): boolean {
  return detectScreensaverSource(url) === "supabase";
}

/** Pure guard — Drive/repo/env URLs are never deletable as uploads. */
export function canDeleteScreensaverUrl(url: string): boolean {
  if (isProtectedStandbyScreensaverUrl(url)) return false;
  return classifyScreensaverDeleteStorage(url) !== null;
}
