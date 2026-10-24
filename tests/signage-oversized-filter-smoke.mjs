/**
 * F-1010 / F-1012 — playlist oversized filter reports dropped items; list cache.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { MAX_TV_VIDEO_BYTES } from "../lib/tv-video-byte-cap.ts";
import { filterOversizedPlaylistMedia } from "../lib/signage-playlist-oversized.ts";

const HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const base = `https://${HOST}/storage/v1/object/public/screensavers/shared`;

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const huge = MAX_TV_VIDEO_BYTES + 1;
let listCalls = 0;
const storage = {
  list: async (_folder, opts) => {
    listCalls += 1;
    const name = opts?.search ?? "";
    const size = name === "big.mp4" ? huge : 1000;
    return {
      data: [
        {
          name,
          id: `id-${name}`,
          metadata: { size, mimetype: "video/mp4" },
        },
      ],
      error: null,
    };
  },
};

const mixed = {
  items: [
    { key: "media-aaa", url: `${base}/ok.mp4`, mediaType: "video" },
    { key: "media-bbb", url: `${base}/big.mp4`, mediaType: "video" },
    { key: "welcome", seconds: 10 },
  ],
  photos: true,
};

const result = await filterOversizedPlaylistMedia(mixed, storage);
check(
  "F-1010 drops only oversized block",
  result.playlist?.items.length === 2 &&
    result.droppedOversized.length === 1 &&
    result.droppedOversized[0].key === "media-bbb" &&
    result.droppedOversized[0].name === "big.mp4"
);

listCalls = 0;
const dup = {
  items: [
    { key: "media-x", url: `${base}/big.mp4`, mediaType: "video" },
    { key: "media-y", url: `${base}/big.mp4`, mediaType: "video" },
  ],
  photos: true,
};
await filterOversizedPlaylistMedia(dup, storage);
check(
  "F-1012 caches storage list per folder/search",
  listCalls === 1
);

process.exit(failed);
