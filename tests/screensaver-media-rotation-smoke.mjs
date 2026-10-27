/**
 * Host screensaver rotation: preview/delete/hide contracts (2026-10-27).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const {
  canDeleteScreensaverUrl,
  detectScreensaverSource,
  driveFileIdFromUrl,
  enrichScreensaverAsset,
} = await import("../lib/screensaver-media-info.ts");
const {
  filterOutHiddenScreensavers,
  sanitizeScreensaverHiddenUrlList,
} = await import("../lib/screensaver-rotation-utils.ts");

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const BLOB =
  "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/a.mp4";
const DRIVE_IMG =
  "https://lh3.googleusercontent.com/d/abc123XYZ=w3840";
const DRIVE_VID =
  "https://drive.usercontent.google.com/download?id=abc123XYZ&confirm=t";
const SUPABASE = `https://${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname}/storage/v1/object/public/screensavers/shared/x.mp4`;

check(
  "detect blob upload source",
  detectScreensaverSource(BLOB) === "upload"
);
check(
  "detect drive image source",
  detectScreensaverSource(DRIVE_IMG) === "google_drive"
);
check(
  "detect drive video source",
  detectScreensaverSource(DRIVE_VID) === "google_drive"
);
check(
  "detect supabase source",
  detectScreensaverSource(SUPABASE) === "supabase"
);

check(
  "drive file id from image url",
  driveFileIdFromUrl(DRIVE_IMG) === "abc123XYZ"
);
check(
  "drive file id from video url",
  driveFileIdFromUrl(DRIVE_VID) === "abc123XYZ"
);

check(
  "blob uploads deletable",
  canDeleteScreensaverUrl(BLOB) && canDeleteScreensaverUrl(SUPABASE)
);
check(
  "drive never deletable via upload delete",
  !canDeleteScreensaverUrl(DRIVE_IMG) && !canDeleteScreensaverUrl(DRIVE_VID)
);

{
  const assets = [
    { url: BLOB, type: "video" },
    { url: DRIVE_IMG, type: "image" },
  ];
  const hidden = new Set([DRIVE_IMG]);
  const out = filterOutHiddenScreensavers(assets, hidden);
  check(
    "TV feed excludes hidden urls",
    out.length === 1 && out[0].url === BLOB
  );
}

{
  const item = enrichScreensaverAsset(
    { url: DRIVE_IMG, type: "image", name: "sunset.jpg", driveFileId: "abc123XYZ" },
    { hiddenFromRotation: true }
  );
  check(
    "drive item hideable not deletable",
    item.hideable && !item.deletable && item.name === "sunset.jpg"
  );
}

check(
  "hidden url list sanitized",
  sanitizeScreensaverHiddenUrlList(["http://a", "bad", "http://a", "ftp://x"])
    .length === 1
);

const routePath = fileURLToPath(
  new URL("../app/api/host/media/rotation/route.ts", import.meta.url)
);
const routeSrc = readFileSync(routePath, "utf8");
check(
  "rotation route requires host auth",
  /isHostAuthenticated/.test(routeSrc)
);
check(
  "rotation route requires confirmed flag",
  /confirmed/.test(routeSrc) && /confirmation required/.test(routeSrc)
);
check(
  "rotation route never trashes drive",
  !/files\/delete/i.test(routeSrc) &&
    !/trashed\s*=\s*true/i.test(routeSrc) &&
    !/drive\.google\.com.*DELETE/i.test(routeSrc)
);

const uiPath = fileURLToPath(
  new URL("../app/host/media/media-rotation-list.tsx", import.meta.url)
);
const uiSrc = readFileSync(uiPath, "utf8");
check(
  "media UI uses confirm before delete/hide",
  (uiSrc.match(/window\.confirm/g) ?? []).length >= 3
);
check(
  "media UI preview modal",
  /PreviewModal/.test(uiSrc) && /<dialog/.test(uiSrc)
);

process.exit(failed);
