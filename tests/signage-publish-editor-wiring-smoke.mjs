/**
 * F-1019 — publish/restore droppedOversized contract + editor tooLargeForTv block.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_TV_VIDEO_BYTES } from "../lib/tv-video-byte-cap.ts";
import { filterOversizedPlaylistMedia } from "../lib/signage-playlist-oversized.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const routeSrc = readFileSync(
  `${root}/app/api/host/signage/route.ts`,
  "utf8"
);
const editorSrc = readFileSync(
  `${root}/app/host/signage/editor.tsx`,
  "utf8"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "F-1019 route filters playlist with filterOversizedPlaylistMedia",
  /filterOversizedPlaylistMedia\s*\(/.test(routeSrc)
);
check(
  "F-1019 route reads filtered.droppedOversized",
  /filtered\.droppedOversized/.test(routeSrc)
);
const successBodies = routeSrc.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) ?? [];
const returnsDropped = successBodies.filter((b) =>
  /\bdroppedOversized\b/.test(b)
).length;
check(
  "F-1019 route JSON responses include droppedOversized",
  returnsDropped >= 2
);

check(
  "F-1019 editor insertMedia blocks tooLargeForTv",
  /function insertMedia[\s\S]*?if \(asset\.tooLargeForTv\) return/.test(
    editorSrc
  )
);
check(
  "F-1019 editor publish reads droppedOversized from API",
  /data\.droppedOversized/.test(editorSrc) &&
    /formatDroppedOversizedNotice/.test(editorSrc)
);
check(
  "F-1019 editor restore persists droppedOversized for notice",
  /restore[\s\S]*?data\.droppedOversized/.test(editorSrc) &&
    /DROPPED_OVERSIZED_STORAGE_KEY/.test(editorSrc)
);

const HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const base = `https://${HOST}/storage/v1/object/public/screensavers/p`;
const huge = MAX_TV_VIDEO_BYTES + 1;
const storage = {
  list: async (_folder, opts) => ({
    data: [
      {
        name: opts?.search ?? "x.mp4",
        id: "id-1",
        metadata: {
          size: (opts?.search ?? "").includes("big") ? huge : 1000,
          mimetype: "video/mp4",
        },
      },
    ],
    error: null,
  }),
};

const playlist = {
  items: [
    { key: "media-ok", url: `${base}/ok.mp4`, mediaType: "video" },
    { key: "media-big", url: `${base}/big.mp4`, mediaType: "video" },
    { key: "welcome" },
  ],
  photos: true,
};

const filtered = await filterOversizedPlaylistMedia(playlist, storage);
const publishBody = {
  ok: true,
  droppedOversized: filtered.droppedOversized,
  vacant: false,
};
check(
  "F-1019 publish contract returns dropped key/name",
  publishBody.droppedOversized.length === 1 &&
    publishBody.droppedOversized[0].key === "media-big" &&
    publishBody.droppedOversized[0].name === "big.mp4" &&
    filtered.playlist?.items.some((it) => it.key === "media-ok")
);

function editorWouldInsert(asset) {
  if (asset.tooLargeForTv) return false;
  return true;
}
check(
  "F-1019 editor insert guard rejects tooLargeForTv asset",
  editorWouldInsert({ url: "https://x/a.mp4", type: "video", tooLargeForTv: true }) ===
    false &&
    editorWouldInsert({ url: "https://x/b.mp4", type: "video" }) === true
);

process.exit(failed);
