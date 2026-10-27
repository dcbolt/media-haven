/**
 * Delete host-uploaded screensaver objects (Blob / Supabase only).
 * Never touches Google Drive files.
 */

import { del } from "@vercel/blob";
import { blobStoreId, blobToken } from "./blob-token.ts";
import {
  classifyScreensaverDeleteStorage,
  validateScreensaverDeleteUrlShape,
} from "./screensaver-delete-url.ts";
import { storagePathFromAllowedPublicUrl } from "./supabase-screensaver-upload-enforce.ts";
import { supabaseAdmin } from "./supabase.ts";

export { canDeleteScreensaverUrl } from "./screensaver-media-info.ts";

export type DeleteScreensaverResult =
  | { ok: true; storage: "blob" | "supabase" }
  | {
      ok: false;
      error: string;
      code?:
        | "not_deletable"
        | "not_found"
        | "protected_standby"
        | "blob_readonly";
    };

/**
 * Blob deletes require a read-write token (`BLOB_READ_WRITE_TOKEN` or
 * `DUNES_READ_WRITE_TOKEN`). Listing can use OIDC + store id alone; `del()`
 * fails without a RW token — prod may be read-only until reconnect (#113).
 */
export function blobDeleteAuthConfigured(): boolean {
  return Boolean(blobToken());
}

export async function deleteScreensaverUpload(
  url: string
): Promise<DeleteScreensaverResult> {
  const shape = validateScreensaverDeleteUrlShape(url);
  if (!shape.ok) {
    return {
      ok: false,
      error: shape.code,
      code: shape.code === "protected_standby" ? "protected_standby" : "not_deletable",
    };
  }

  const storage = classifyScreensaverDeleteStorage(url);
  if (storage === "blob") {
    const token = blobToken();
    if (!token) {
      return {
        ok: false,
        error:
          "Blob delete needs a read-write token (BLOB_READ_WRITE_TOKEN). Listing works with store id only; reconnect the Blob store with a RW token to enable deletes.",
        code: "blob_readonly",
      };
    }
    try {
      await del(url, {
        token,
        ...(blobStoreId() ? { storeId: blobStoreId() } : {}),
      });
      return { ok: true, storage: "blob" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "blob delete failed";
      const readonly =
        /forbidden|unauthorized|403|401|read.?only|permission/i.test(msg);
      return {
        ok: false,
        error: readonly
          ? "Blob token cannot delete (read-only or insufficient scope). Add a read-write token in Vercel Storage."
          : msg,
        code: readonly ? "blob_readonly" : undefined,
      };
    }
  }

  const path = storagePathFromAllowedPublicUrl(url);
  if (!path) {
    return { ok: false, error: "bad supabase url", code: "not_deletable" };
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
