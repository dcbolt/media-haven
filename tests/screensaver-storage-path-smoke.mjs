/**
 * Screensaver Supabase storage path join + remove acknowledgement (listV2 shapes).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  screensaverStorageObjectPath,
  storagePathFromAllowedPublicUrl,
} = await import("../lib/supabase-screensaver-upload-enforce.ts");
const { supabaseStorageRemoveAcknowledged } = await import(
  "../lib/screensaver-media-delete.ts"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;

check(
  "storage path: basename-only name under shared",
  screensaverStorageObjectPath("shared", { name: "clip.mp4" }) === "shared/clip.mp4"
);

check(
  "storage path: name already includes shared prefix",
  screensaverStorageObjectPath("shared", { name: "shared/clip.mp4" }) ===
    "shared/clip.mp4"
);

check(
  "storage path: prefers listV2 key when present",
  screensaverStorageObjectPath("shared", {
    name: "clip.mp4",
    key: "shared/clip.mp4",
  }) === "shared/clip.mp4"
);

check(
  "storage path: property prefix without doubling",
  screensaverStorageObjectPath("prop-abc", { name: "prop-abc/hero.jpg" }) ===
    "prop-abc/hero.jpg"
);

{
  const path = screensaverStorageObjectPath("shared", {
    name: "shared/waves.mp4",
  });
  const url = `https://${host}/storage/v1/object/public/screensavers/${path}`;
  check(
    "public url parses back to single shared segment",
    storagePathFromAllowedPublicUrl(url) === "shared/waves.mp4" &&
      !url.includes("/shared/shared/")
  );
}

check(
  "remove ack: empty data is not_found",
  supabaseStorageRemoveAcknowledged([], 1).ok === false &&
    supabaseStorageRemoveAcknowledged([], 1).code === "not_found"
);

check(
  "remove ack: deleted row present succeeds",
  supabaseStorageRemoveAcknowledged([{ name: "shared/x.mp4" }], 1).ok === true
);

check(
  "remove ack: short batch is not_found",
  supabaseStorageRemoveAcknowledged([{ name: "a" }], 2).ok === false
);

const enforceSrc = readFileSync(
  fileURLToPath(
    new URL(
      "../node_modules/@supabase/storage-js/src/lib/types.ts",
      import.meta.url
    )
  ),
  "utf8"
);
check(
  "listV2 SearchV2Object documents key as full path",
  /SearchV2Object[\s\S]*key\?: string/.test(enforceSrc)
);

process.exit(failed);