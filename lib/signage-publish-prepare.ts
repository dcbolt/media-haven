/**
 * Signage publish/restore playlist prep + OK response (F-1031) — used by route + smokes.
 */

import {
  filterOversizedPlaylistMedia,
  type SignagePlaylistForOversizedFilter,
} from "./signage-playlist-oversized.ts";
import type { ScreensaverStorageReader } from "./supabase-screensaver-upload-enforce.ts";
import {
  signagePlaylist,
  type SignagePlaylist,
} from "./signage-playlist-sanitize.ts";

export type SignageDroppedOversizedItem = { key: string; name: string };

export type SignagePlaylistWritePrep = {
  playlist: SignagePlaylist | null;
  droppedOversized: SignageDroppedOversizedItem[];
};

/** Filter oversized Supabase videos out of a host publish payload. */
export async function prepareSignagePlaylistForPublish(
  rawPlaylist: unknown,
  storage?: ScreensaverStorageReader | null
): Promise<SignagePlaylistWritePrep> {
  const pl = signagePlaylist(rawPlaylist) as SignagePlaylistForOversizedFilter | null;
  const filtered =
    storage === undefined
      ? await filterOversizedPlaylistMedia(pl)
      : await filterOversizedPlaylistMedia(pl, storage);
  return {
    playlist: filtered.playlist as SignagePlaylist | null,
    droppedOversized: filtered.droppedOversized,
  };
}

/** Filter oversized items when restoring from history. */
export async function prepareSignagePlaylistForRestore(
  rawHistoryPlaylist: unknown,
  storage?: ScreensaverStorageReader | null
): Promise<SignagePlaylistWritePrep> {
  const pl = signagePlaylist(
    rawHistoryPlaylist
  ) as SignagePlaylistForOversizedFilter | null;
  const filtered =
    storage === undefined
      ? await filterOversizedPlaylistMedia(pl)
      : await filterOversizedPlaylistMedia(pl, storage);
  return {
    playlist: filtered.playlist as SignagePlaylist | null,
    droppedOversized: filtered.droppedOversized,
  };
}

export function buildSignagePublishOkResponse(input: {
  reset: boolean;
  restored: boolean;
  vacant: boolean;
  droppedOversized: SignageDroppedOversizedItem[];
}): {
  ok: true;
  reset: boolean;
  restored: boolean;
  vacant: boolean;
  droppedOversized: SignageDroppedOversizedItem[];
} {
  return {
    ok: true,
    reset: input.reset,
    restored: input.restored,
    vacant: input.vacant,
    droppedOversized: input.droppedOversized,
  };
}

export function buildSignageBulkApplyOkResponse(input: {
  applied: number;
  vacant: boolean;
  droppedOversized: SignageDroppedOversizedItem[];
}): {
  ok: true;
  applied: number;
  vacant: boolean;
  droppedOversized: SignageDroppedOversizedItem[];
} {
  return {
    ok: true,
    applied: input.applied,
    vacant: input.vacant,
    droppedOversized: input.droppedOversized,
  };
}
