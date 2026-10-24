/**
 * POST /api/host/media/upload-verify body — shared with route + Node smokes.
 */

import {
  enforceSupabaseScreensaverSize,
  type ScreensaverStorageReader,
  type SupabaseScreensaverSizeCheck,
} from "./supabase-screensaver-upload-enforce.ts";

/** Build Storage list reader from a Supabase admin client (or null). */
export function screensaverStorageReaderFromDb(
  db: {
    storage: {
      from: (bucket: string) => {
        list: ScreensaverStorageReader["list"];
      };
    };
  } | null
): ScreensaverStorageReader | null {
  if (!db) return null;
  return {
    list: (folder, opts) => db.storage.from("screensavers").list(folder, opts),
  };
}

export type HostMediaUploadVerifyInput = {
  storagePath?: string | null;
  publicUrl?: string | null;
  name?: string;
  mimeType?: string;
};

/** Same validation + enforce path the upload-verify route uses (F-1007). */
export async function runHostMediaUploadVerify(
  input: HostMediaUploadVerifyInput,
  storage: ScreensaverStorageReader | null
): Promise<
  | { ok: false; status: 400; body: { error: string } }
  | { ok: true; status: 200; body: SupabaseScreensaverSizeCheck }
> {
  const storagePath =
    typeof input.storagePath === "string" ? input.storagePath.trim() : "";
  const publicUrl =
    typeof input.publicUrl === "string" ? input.publicUrl.trim() : "";
  if (!storagePath && !publicUrl) {
    return {
      ok: false,
      status: 400,
      body: { error: "storagePath or publicUrl required" },
    };
  }
  const body = await enforceSupabaseScreensaverSize(storage, {
    storagePath: storagePath || null,
    publicUrl: publicUrl || null,
    name: input.name,
    mimeType: input.mimeType,
  });
  return { ok: true, status: 200, body };
}
