/**
 * Blob pagination + upload size limits (screensaver listing fix + F-990–994).
 */
import {
  BLOB_LIST_MAX_PAGES,
  BLOB_LIST_TIME_BUDGET_MS,
  fetchAllBlobRows,
  mapBlobRowsToAssets,
} from "../lib/screensavers-blob-list.ts";
import {
  MAX_TV_VIDEO_BYTES,
  maxUploadBytesForUpload,
  uploadSizeRejection,
} from "../lib/media-upload-limits.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

{
  let calls = 0;
  const { rows, partial } = await fetchAllBlobRows(async (cursor) => {
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
  check(
    "blob pagination fetches past 100",
    rows.length === 101 && calls === 2 && partial === false
  );
}

{
  let t = 0;
  const { partial } = await fetchAllBlobRows(
    async () => {
      t += 50;
      return {
        blobs: [{ pathname: "screensavers/a.jpg", url: "https://x/a.jpg", size: 1 }],
        cursor: "same",
        hasMore: true,
      };
    },
    {
      deadlineMs: 200,
      maxPages: 10,
      now: () => {
        t += 1;
        return t;
      },
    }
  );
  check("repeated cursor stops with partial", partial === true);
}

{
  let t = 0;
  const { partial } = await fetchAllBlobRows(
    async () => ({
      blobs: [{ pathname: "screensavers/a.jpg", url: "https://x/a.jpg", size: 1 }],
      cursor: "next",
      hasMore: true,
    }),
    {
      deadlineMs: 100,
      maxPages: 50,
      now: () => {
        t += 60;
        return t;
      },
    }
  );
  check("time budget returns partial", partial === true);
}

check(
  "defaults under TV budget",
  BLOB_LIST_TIME_BUDGET_MS < 8000 && BLOB_LIST_MAX_PAGES >= 2
);

{
  const assets = mapBlobRowsToAssets([
    {
      pathname: "screensavers/ok.mp4",
      url: "https://x/a.mp4",
      size: MAX_TV_VIDEO_BYTES,
      contentType: "video/mp4",
    },
    {
      pathname: "screensavers/huge.mp4",
      url: "https://x/huge.mp4",
      size: MAX_TV_VIDEO_BYTES + 1,
      contentType: "video/mp4",
    },
    {
      pathname: "screensavers/wrong-ext.jpg",
      url: "https://x/v.mp4",
      size: MAX_TV_VIDEO_BYTES + 1,
      contentType: "video/mp4",
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
  check(
    "F-994: video mime flags oversized despite .jpg pathname",
    assets.find((a) => a.url === "https://x/v.mp4")?.tooLargeForTv === true
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
check(
  "max bytes follow mime not extension",
  maxUploadBytesForUpload("still.jpg", "video/mp4") === MAX_TV_VIDEO_BYTES
);

process.exit(failed);
