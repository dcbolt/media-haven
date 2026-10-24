/**
 * F-996 — canonical cap matches inlined blob-list constant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAX_TV_VIDEO_BYTES as fromCap } from "../lib/tv-video-byte-cap.ts";
import { MAX_TV_VIDEO_BYTES as fromLimits } from "../lib/media-upload-limits.ts";

const blobListSrc = readFileSync(
  fileURLToPath(new URL("../lib/screensavers-blob-list.ts", import.meta.url)),
  "utf8"
);
const m = blobListSrc.match(
  /const MAX_TV_VIDEO_BYTES = (\d+) \* 1024 \* 1024/
);
const inlined = m ? Number(m[1]) * 1024 * 1024 : NaN;

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const enforceSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/supabase-screensaver-upload-enforce.ts", import.meta.url)
  ),
  "utf8"
);
const em = enforceSrc.match(
  /const MAX_TV_VIDEO_BYTES = (\d+) \* 1024 \* 1024/
);
const enforceInline = em ? Number(em[1]) * 1024 * 1024 : NaN;

check("cap matches media-upload-limits", fromCap === fromLimits);
check("cap matches blob-list inline", fromCap === inlined);
check("cap matches supabase enforce inline", fromCap === enforceInline);

process.exit(failed);
