/**
 * Delete host-uploaded screensaver objects (Blob / Supabase only).
 * Never touches Google Drive files.
 */

import { del } from "@vercel/blob";
import { blobStoreId, blobToken } from "./blob-token.ts";
import {
  canDeleteScreensaverUrl,
  isVercelBlobScreensaverUrl,
} from "./screensaver-media-info.ts";
import { storagePathFromAllowedPublicUrl } from "./supabase-screensaver-upload-enforce.ts";
import { supabaseAdmin } from "./supabase.ts";

export { canDeleteScreensaverUrl } from "./screensaver-media-info.ts";

export type DeleteScreensaverResult =
  | { ok: true; storage: "blob" | "supabase" }
  | { ok: false; error: string; code?: "not_deletable" | "not_found" };

export async function deleteScreensaverUpload(
  url: string
): Promise<DeleteScreensaverResult> {
  if (!canDeleteScreensaverUrl(url)) {
    return { ok: false, error: "not deletable", code: "not_deletable" };
  }

  if (isVercelBlobScreensaverUrl(url)) {
    const token = blobToken();
    if (!token) {
      return { ok: false, error: "blob not configured" };
    }
    try {
      await del(url, { token, ...(blobStoreId() ? { storeId: blobStoreId() } : {}) });
      return { ok: true, storage: "blob" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "blob delete failed",
      };
    }
  }

  const path = storagePathFromAllowedPublicUrl(url);
  if (!path) {
    return { ok: false, error: "bad supabase url" };
  }
  const db = supabaseAdmin();
  if (!db) {
    return { ok: false, error: "no database" };
  }
  const { error } = await db.storage.from("screensavers").remove([path]);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, storage: "supabase" };
}
