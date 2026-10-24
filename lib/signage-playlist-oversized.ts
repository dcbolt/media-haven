/**
 * Drop oversized Supabase videos from host playlists (F-1008 / F-1010).
 */

import { supabaseAdmin } from "./supabase.ts";
import {
  enforceSupabaseScreensaverSize,
  storagePathFromAllowedPublicUrl,
  withScreensaverListCache,
  type ScreensaverStorageReader,
} from "./supabase-screensaver-upload-enforce.ts";

function defaultScreensaverStorageReader(): ScreensaverStorageReader | null {
  const db = supabaseAdmin();
  if (!db) return null;
  return {
    list: (folder, opts) => db.storage.from("screensavers").list(folder, opts),
  };
}

export type SignagePlaylistForOversizedFilter = {
  items: Array<{
    key: string;
    url?: string;
    mediaType?: "image" | "video";
    seconds?: number;
    transition?: string;
    daypart?: string;
  }>;
  photos: boolean;
};

export type DroppedOversizedPlaylistItem = {
  key: string;
  name: string;
};

export type FilterOversizedPlaylistResult = {
  playlist: SignagePlaylistForOversizedFilter | null;
  droppedOversized: DroppedOversizedPlaylistItem[];
};

function droppedOversizedLabel(
  it: SignagePlaylistForOversizedFilter["items"][number]
): string {
  if (it.url) {
    try {
      const tail = it.url.split("/").pop()?.split("?")[0];
      if (tail) return decodeURIComponent(tail);
    } catch {
      /* ignore */
    }
  }
  return it.key;
}

export async function filterOversizedPlaylistMedia(
  pl: SignagePlaylistForOversizedFilter | null,
  storage: ScreensaverStorageReader | null = defaultScreensaverStorageReader()
): Promise<FilterOversizedPlaylistResult> {
  const empty: FilterOversizedPlaylistResult = {
    playlist: null,
    droppedOversized: [],
  };
  if (!pl) return empty;
  const cached = storage ? withScreensaverListCache(storage) : null;
  const kept: SignagePlaylistForOversizedFilter["items"] = [];
  const droppedOversized: DroppedOversizedPlaylistItem[] = [];
  for (const it of pl.items) {
    if (!it.url || it.mediaType !== "video") {
      kept.push(it);
      continue;
    }
    const fromUrl = storagePathFromAllowedPublicUrl(it.url);
    if (!fromUrl && !it.url.includes(".supabase.co/storage/")) {
      kept.push(it);
      continue;
    }
    const flagged = await enforceSupabaseScreensaverSize(cached, {
      storagePath: fromUrl,
      publicUrl: it.url,
    });
    if (!flagged.tooLargeForTv) {
      kept.push(it);
    } else {
      droppedOversized.push({
        key: it.key,
        name: droppedOversizedLabel(it),
      });
    }
  }
  if (kept.length === 0) {
    return { playlist: null, droppedOversized };
  }
  const playlist =
    kept.length === pl.items.length ? pl : { ...pl, items: kept };
  return { playlist, droppedOversized };
}
