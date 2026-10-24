/**
 * F-1002 / F-1003 — flag only, no fetch/delete; metadata from storage list.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_TV_VIDEO_BYTES } from "../lib/tv-video-byte-cap.ts";
import {
  enforceSupabaseScreensaverSize,
  storagePathFromAllowedPublicUrl,
} from "../lib/supabase-screensaver-upload-enforce.ts";

const PROJECT_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;

const src = readFileSync(
  fileURLToPath(
    new URL("../lib/supabase-screensaver-upload-enforce.ts", import.meta.url)
  ),
  "utf8"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "F-1002 source has no storage.remove",
  !/\.remove\s*\(/.test(src)
);
check("F-1002 source has no fetch(", !/\bfetch\s*\(/.test(src));

check(
  "F-1003 rejects foreign host URL",
  storagePathFromAllowedPublicUrl("https://evil.com/storage/v1/object/public/screensavers/x.mp4") ===
    null
);
check(
  "F-1003 allows project storage host",
  storagePathFromAllowedPublicUrl(
    `https://${PROJECT_HOST}/storage/v1/object/public/screensavers/shared/a.mp4`
  ) === "shared/a.mp4"
);

let fetchCalled = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = () => {
  fetchCalled += 1;
  return Promise.reject(new Error("fetch should not run"));
};

try {
  const huge = MAX_TV_VIDEO_BYTES + 1;
  let listCalls = 0;
  const storage = {
    list: async () => {
      listCalls += 1;
      return {
        data: [
          {
            name: "big.mp4",
            id: "id-1",
            metadata: { size: huge, mimetype: "video/mp4" },
          },
        ],
        error: null,
      };
    },
  };

  const flagged = await enforceSupabaseScreensaverSize(storage, {
    storagePath: "shared/big.mp4",
    name: "big.mp4",
    mimeType: "video/mp4",
  });
  check(
    "oversized flagged not deleted",
    flagged.flagged === true &&
      flagged.tooLargeForTv === true &&
      flagged.ok === true &&
      flagged.sizeBytes === huge
  );
  check("metadata from storage list", listCalls >= 1);
  check("forged-url path: no fetch on foreign host", fetchCalled === 0);

  await enforceSupabaseScreensaverSize(storage, {
    publicUrl: "https://attacker.example/x.mp4",
    name: "x.mp4",
    mimeType: "video/mp4",
  });
  check("foreign publicUrl skips storage list", listCalls === 1);
  check("still no fetch after foreign url", fetchCalled === 0);
} finally {
  globalThis.fetch = origFetch;
}

process.exit(failed);
