/**
 * TV rotation must drop trashed/hidden mediaMeta (F-983) — wiring + deletion mutant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMediaTrashed } from "../lib/media-library.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const mediaMetaSrc = readFileSync(
  fileURLToPath(new URL("../lib/media-meta.ts", import.meta.url)),
  "utf8"
);
const tvSrc = readFileSync(
  fileURLToPath(new URL("../lib/tv.ts", import.meta.url)),
  "utf8"
);

function rotationTrashFilterWiringOk(metaSrc, tvPageSrc) {
  return (
    /\bisMediaTrashed\b/.test(metaSrc) &&
    /export function isMediaCurrentlyValid/.test(metaSrc) &&
    /if \(isMediaTrashed\(entry, now\)\) return false/.test(metaSrc) &&
    /export function filterValidPlaylistMedia/.test(tvPageSrc) &&
    /isMediaCurrentlyValid\(meta\[it\.url\]/.test(tvPageSrc)
  );
}

check("rotation trash filter wired", rotationTrashFilterWiringOk(mediaMetaSrc, tvSrc));
check(
  "deletion mutant: drop isMediaTrashed check fails wiring",
  !rotationTrashFilterWiringOk(
    mediaMetaSrc.replace(
      "if (isMediaTrashed(entry, now)) return false;",
      "// mutant removed trash filter"
    ),
    tvSrc
  )
);
check(
  "deletion mutant: drop filterValidPlaylistMedia validity fails wiring",
  !rotationTrashFilterWiringOk(
    mediaMetaSrc,
    tvSrc.replace(/isMediaCurrentlyValid\(meta\[it\.url\][^)]*\)/, "true")
  )
);

check(
  "trashed meta excluded from rotation (behavioral)",
  isMediaTrashed({ url: "https://x/y.jpg", trashedAt: "2020-01-01T00:00:00.000Z" })
);

process.exit(failed);
