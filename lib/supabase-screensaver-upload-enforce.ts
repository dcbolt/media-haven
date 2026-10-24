/**
 * App-level Supabase screensaver size flag (F-991 / F-1002 / F-1003).
 * Size from Storage list metadata only — no client URL fetch, no deletes.
 */

import { MAX_TV_VIDEO_BYTES } from "./tv-video-byte-cap.ts";
import { getSupabaseProjectHost } from "./supabase-project-url.ts";

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

export function isVideoMedia(mimeType: string, name: string): boolean {
  return mimeType.startsWith("video/") || VIDEO_EXT.test(name);
}

/** Parse storage path from our Supabase public object URL (host allowlist). */
export function storagePathFromAllowedPublicUrl(
  publicUrl: string
): string | null {
  try {
    const u = new URL(publicUrl);
    const allowedHost = getSupabaseProjectHost();
    if (!allowedHost || u.hostname !== allowedHost) return null;
    const marker = "/storage/v1/object/public/screensavers/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const storagePath = decodeURIComponent(
      u.pathname.slice(idx + marker.length)
    );
    if (!storagePath || storagePath.includes("..")) return null;
    return storagePath;
  } catch {
    return null;
  }
}

/** @deprecated alias */
export function screensaverStoragePathFromPublicUrl(
  publicUrl: string
): string | null {
  return storagePathFromAllowedPublicUrl(publicUrl);
}

export function normalizeScreensaverStoragePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) {
    return null;
  }
  if (!/^[a-zA-Z0-9_./-]+$/.test(trimmed)) return null;
  return trimmed;
}

export type ScreensaverStorageListRow = {
  name: string;
  id: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ScreensaverStorageReader = {
  list: (
    folder: string,
    opts?: { limit?: number; search?: string }
  ) => Promise<{
    data: ScreensaverStorageListRow[] | null;
    error: { message: string } | null;
  }>;
};

export function sizeFromStorageMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  if (!metadata) return null;
  const raw = metadata.size;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function mimeFromStorageMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  if (!metadata) return null;
  if (typeof metadata.mimetype === "string") return metadata.mimetype;
  if (typeof metadata.contentType === "string") return metadata.contentType;
  return null;
}

/** Per-request cache for storage.list(folder, opts) — F-1012. */
export function withScreensaverListCache(
  storage: ScreensaverStorageReader
): ScreensaverStorageReader {
  const pending = new Map<string, ReturnType<ScreensaverStorageReader["list"]>>();
  return {
    list: (folder, opts) => {
      const key = `${folder}\0${opts?.search ?? ""}\0${opts?.limit ?? ""}`;
      let hit = pending.get(key);
      if (!hit) {
        hit = storage.list(folder, opts);
        pending.set(key, hit);
      }
      return hit;
    },
  };
}

/** Resolve object metadata via Supabase Storage list (server-side). */
export async function lookupScreensaverStorageMetadata(
  storage: ScreensaverStorageReader,
  storagePath: string
): Promise<{
  sizeBytes: number | null;
  mimeType: string | null;
} | null> {
  const slash = storagePath.lastIndexOf("/");
  const folder = slash >= 0 ? storagePath.slice(0, slash) : "";
  const fileName = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const { data, error } = await storage.list(folder, {
    limit: 100,
    search: fileName,
  });
  if (error || !data) return null;
  const row = data.find((f) => f.name === fileName && f.id != null);
  if (!row) return null;
  return {
    sizeBytes: sizeFromStorageMetadata(row.metadata),
    mimeType: mimeFromStorageMetadata(row.metadata),
  };
}

export type SupabaseScreensaverSizeCheck = {
  ok: boolean;
  sizeBytes: number | null;
  tooLargeForTv: boolean;
  flagged: boolean;
  storagePath: string | null;
  reason?: string;
};

/**
 * Flag oversized videos using Storage metadata only (never deletes).
 */
export async function enforceSupabaseScreensaverSize(
  storage: ScreensaverStorageReader | null,
  input: {
    storagePath?: string | null;
    publicUrl?: string | null;
    name?: string;
    mimeType?: string;
  }
): Promise<SupabaseScreensaverSizeCheck> {
  let storagePath =
    input.storagePath != null
      ? normalizeScreensaverStoragePath(input.storagePath)
      : null;
  if (!storagePath && input.publicUrl) {
    storagePath = storagePathFromAllowedPublicUrl(input.publicUrl);
  }
  if (!storagePath) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      flagged: false,
      storagePath: null,
    };
  }

  const fileName = storagePath.split("/").pop() ?? storagePath;
  const hintName = input.name?.trim() || fileName;
  const hintMime = input.mimeType?.trim() ?? "";

  if (!storage) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      flagged: false,
      storagePath,
      reason: "storage admin unavailable",
    };
  }

  const meta = await lookupScreensaverStorageMetadata(storage, storagePath);
  if (!meta) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      flagged: false,
      storagePath,
      reason: "object not found in storage listing",
    };
  }

  const mimeType = meta.mimeType ?? hintMime;
  if (!isVideoMedia(mimeType, hintName)) {
    return {
      ok: true,
      sizeBytes: meta.sizeBytes,
      tooLargeForTv: false,
      flagged: false,
      storagePath,
    };
  }

  const sizeBytes = meta.sizeBytes;
  if (sizeBytes == null) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      flagged: false,
      storagePath,
      reason: "video size unknown in storage metadata",
    };
  }

  if (sizeBytes <= MAX_TV_VIDEO_BYTES) {
    return {
      ok: true,
      sizeBytes,
      tooLargeForTv: false,
      flagged: false,
      storagePath,
    };
  }

  console.log("[media-upload]", {
    route: "supabase-screensaver-enforce",
    storagePath,
    sizeBytes,
    maxBytes: MAX_TV_VIDEO_BYTES,
    result: "flagged_oversized",
  });

  return {
    ok: true,
    sizeBytes,
    tooLargeForTv: true,
    flagged: true,
    storagePath,
    reason: "video exceeds TV size cap — flagged, not rotated (not deleted)",
  };
}
