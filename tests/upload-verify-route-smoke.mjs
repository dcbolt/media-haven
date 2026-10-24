/**
 * F-1007 / F-1011 — upload-verify route handler path: mock Storage (remove forbidden),
 * `..` path guards, flagged_oversized log; source scan for storage.remove.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_TV_VIDEO_BYTES } from "../lib/tv-video-byte-cap.ts";
import {
  runHostMediaUploadVerify,
  screensaverStorageReaderFromDb,
} from "../lib/host-media-upload-verify.ts";
import {
  normalizeScreensaverStoragePath,
  storagePathFromAllowedPublicUrl,
} from "../lib/supabase-screensaver-upload-enforce.ts";

const routeSrc = readFileSync(
  fileURLToPath(
    new URL("../app/api/host/media/upload-verify/route.ts", import.meta.url)
  ),
  "utf8"
);
const helperSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/host-media-upload-verify.ts", import.meta.url)
  ),
  "utf8"
);

const STORAGE_REMOVE_RE = /\.remove\s*\(|remove\s*\?\.\s*\(/;

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "F-1007 route delegates to runHostMediaUploadVerify",
  /runHostMediaUploadVerify\s*\(/.test(routeSrc) &&
    /screensaverStorageReaderFromDb/.test(routeSrc)
);
check(
  "F-1011 upload-verify route has no storage.remove",
  !STORAGE_REMOVE_RE.test(routeSrc)
);
check(
  "F-1011 host-media-upload-verify has no storage.remove",
  !STORAGE_REMOVE_RE.test(helperSrc)
);

check(
  "F-1007 normalize rejects .. segment",
  normalizeScreensaverStoragePath("shared/../evil.mp4") === null
);
check(
  "F-1007 normalize rejects leading slash",
  normalizeScreensaverStoragePath("/shared/x.mp4") === null
);
check(
  "F-1007 public URL rejects .. in path",
  storagePathFromAllowedPublicUrl(
    `https://${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}/storage/v1/object/public/screensavers/a%2F..%2Fb.mp4`
  ) === null
);

let removeCalls = 0;
const huge = MAX_TV_VIDEO_BYTES + 42;
const mockDb = {
  storage: {
    from: () => ({
      list: async () => ({
        data: [
          {
            name: "big.mp4",
            id: "id-1",
            metadata: { size: huge, mimetype: "video/mp4" },
          },
        ],
        error: null,
      }),
      remove: async () => {
        removeCalls += 1;
        throw new Error("F-1007 storage.remove must not be called");
      },
    }),
  },
};

const reader = screensaverStorageReaderFromDb(mockDb);
const logs = [];
const origLog = console.log;
console.log = (...args) => {
  logs.push(args);
  origLog(...args);
};

try {
  const res = await runHostMediaUploadVerify(
    { storagePath: "folder/big.mp4", name: "big.mp4", mimeType: "video/mp4" },
    reader
  );
  check(
    "F-1007 route handler flags oversized video",
    res.ok === true &&
      res.body.flagged === true &&
      res.body.tooLargeForTv === true
  );
  check("F-1011 mock remove never called on handler path", removeCalls === 0);
  const flaggedLog = logs.find(
    (row) =>
      row[0] === "[media-upload]" &&
      row[1]?.result === "flagged_oversized"
  );
  check("F-1007 flagged_oversized log line", Boolean(flaggedLog));

  const bad = await runHostMediaUploadVerify({}, reader);
  check(
    "F-1007 missing path returns 400",
    bad.ok === false && bad.status === 400
  );
} finally {
  console.log = origLog;
}

process.exit(failed);
