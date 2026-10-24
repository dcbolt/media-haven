/**
 * Blob pagination + upload size limits (screensaver listing fix).
 */
import {
  fetchAllBlobRows,
  mapBlobRowsToAssets,
} from "../lib/screensavers-blob-list.ts";
import {
  MAX_TV_VIDEO_BYTES,
  uploadSizeRejection,
} from "../lib/media-upload-limits.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

{
  let calls = 0;
  const rows = await fetchAllBlobRows(async (cursor) => {
    calls += 1;
    if (!cursor) {
      return {
        blobs: Array.from({ length: 100 }, (_, i) => ({
          pathname: `screensavers/p${i}.jpg`,
          url: `https://x.blob.vercel-storage.com/p${i}.jpg`,
          size: 1000,
        })),
        cursor: "page2",
        hasMore: true,
      };
    }
    return {
      blobs: [
        {
          pathname: "screensavers/extra.mp4",
          url: "https://x.blob.vercel-storage.com/extra.mp4",
          size: 5000,
        },
      ],
      hasMore: false,
    };
  });
  check("blob pagination fetches past 100", rows.length === 101 && calls === 2);
}

{
  const assets = mapBlobRowsToAssets([
    {
      pathname: "screensavers/ok.mp4",
      url: "https://x/a.mp4",
      size: MAX_TV_VIDEO_BYTES,
    },
    {
      pathname: "screensavers/huge.mp4",
      url: "https://x/huge.mp4",
      size: MAX_TV_VIDEO_BYTES + 1,
    },
  ]);
  check(
    "oversized video flagged not rotated",
    assets.find((a) => a.url.includes("huge"))?.tooLargeForTv === true
  );
  check(
    "in-budget video rotates",
    assets.find((a) => a.url.includes("ok"))?.tooLargeForTv !== true
  );
}

check(
  "oversized upload rejected",
  uploadSizeRejection("clip.mp4", "video/mp4", MAX_TV_VIDEO_BYTES + 1) !== null
);
check(
  "in-budget video accepted",
  uploadSizeRejection("clip.mp4", "video/mp4", MAX_TV_VIDEO_BYTES) === null
);

process.exit(failed);
