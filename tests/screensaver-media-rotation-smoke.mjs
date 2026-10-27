/**
 * Screensaver rotation pure guards + Drive video exclusion (F-2543).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { driveFileToScreensaverAsset } = await import(
  "../lib/screensaver-drive-map.ts"
);
const {
  filterOutHiddenScreensavers,
  sanitizeScreensaverHiddenUrlList,
} = await import("../lib/screensaver-rotation-utils.ts");
const {
  validateScreensaverDeleteUrlShape,
  blobScreensaverPathOk,
} = await import("../lib/screensaver-delete-url.ts");
const { DEFAULT_STANDBY_SCREENSAVER_URL } = await import(
  "../lib/screensaver-standby.ts"
);
const { enrichScreensaverAsset } = await import(
  "../lib/screensaver-media-info.ts"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "F-2543 drive video not in TV feed mapping",
  driveFileToScreensaverAsset({
    id: "v1",
    name: "clip.mp4",
    mimeType: "video/mp4",
  }) === null
);
check(
  "F-2543 drive image still mapped",
  driveFileToScreensaverAsset({
    id: "i1",
    name: "sun.jpg",
    mimeType: "image/jpeg",
  })?.type === "image"
);

check(
  "F-2544 rejects .. in blob path",
  blobScreensaverPathOk("/screensavers/../secret.mp4") === false
);

check(
  "F-2545 standby url protected",
  validateScreensaverDeleteUrlShape(DEFAULT_STANDBY_SCREENSAVER_URL).ok === false
);

{
  const item = enrichScreensaverAsset(
    { url: DEFAULT_STANDBY_SCREENSAVER_URL, type: "video" },
    {}
  );
  check("F-2545 UI deletable false for standby", !item.deletable && item.protectedStandby);
}

check(
  "hidden url list sanitized",
  sanitizeScreensaverHiddenUrlList(["https://a", "bad", "https://a"]).length ===
    1
);

{
  const out = filterOutHiddenScreensavers(
    [{ url: "https://a" }, { url: "https://b" }],
    new Set(["https://b"])
  );
  check("TV feed excludes hidden", out.length === 1 && out[0].url === "https://a");
}

const uiPath = fileURLToPath(
  new URL("../app/host/media/media-rotation-list.tsx", import.meta.url)
);
const uiSrc = readFileSync(uiPath, "utf8");
check(
  "media UI uses confirm",
  (uiSrc.match(/window\.confirm/g) ?? []).length >= 3
);
check(
  "F-2550 no empty catch on row actions",
  !/onUnhide\(\)\.catch\(\(\) => \{\}\)/.test(uiSrc) &&
    !/onDeleteOrHide\(\)\.catch\(\(\) => \{\}\)/.test(uiSrc)
);

process.exit(failed);
