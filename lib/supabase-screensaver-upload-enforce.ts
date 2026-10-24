/**
 * App-level Supabase screensaver size enforcement (F-991) — works without bucket migration.
 */

/** Must match lib/tv-video-byte-cap.ts (F-996). */
const MAX_TV_VIDEO_BYTES = 150 * 1024 * 1024;

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

function isVideoMedia(mimeType: string, name: string): boolean {
  return mimeType.startsWith("video/") || VIDEO_EXT.test(name);
}

/** Public object URL → storage path inside bucket `screensavers`. */
export function screensaverStoragePathFromPublicUrl(
  publicUrl: string
): string | null {
  try {
    const u = new URL(publicUrl);
    const marker = "/storage/v1/object/public/screensavers/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    const path = decodeURIComponent(u.pathname.slice(idx + marker.length));
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

export type SupabaseScreensaverSizeCheck = {
  ok: boolean;
  sizeBytes: number | null;
  tooLargeForTv: boolean;
  removed: boolean;
  reason?: string;
};

type StorageAdmin = {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/** HEAD the public object; remove from bucket when video exceeds TV cap. */
export async function enforceSupabaseScreensaverSize(
  db: StorageAdmin | null,
  publicUrl: string,
  name: string,
  mimeType: string
): Promise<SupabaseScreensaverSizeCheck> {
  const path = screensaverStoragePathFromPublicUrl(publicUrl);
  if (!path) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      removed: false,
    };
  }
  if (!isVideoMedia(mimeType, name)) {
    return { ok: true, sizeBytes: null, tooLargeForTv: false, removed: false };
  }

  let sizeBytes: number | null = null;
  try {
    const head = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      const cl = head.headers.get("content-length");
      if (cl != null) {
        const n = Number(cl);
        if (Number.isFinite(n)) sizeBytes = n;
      }
    }
  } catch {
    sizeBytes = null;
  }

  if (sizeBytes == null) {
    return {
      ok: true,
      sizeBytes: null,
      tooLargeForTv: false,
      removed: false,
      reason: "size unknown — listed with metadata when available",
    };
  }

  if (sizeBytes <= MAX_TV_VIDEO_BYTES) {
    return { ok: true, sizeBytes, tooLargeForTv: false, removed: false };
  }

  let removed = false;
  if (db) {
    const { error } = await db.storage.from("screensavers").remove([path]);
    removed = !error;
  }

  return {
    ok: false,
    sizeBytes,
    tooLargeForTv: true,
    removed,
    reason: removed
      ? "video exceeded TV size cap and was removed from storage"
      : "video exceeded TV size cap (remove failed — flagged in listing only)",
  };
}
