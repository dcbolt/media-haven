/**
 * F-1134 / F-1137 — standby two-video rotation must not strip the next video src.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { releaseVideoElement } from "../lib/tv-media-memory.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function makeVideo(label) {
  let src = label;
  return {
    label,
    pause() {},
    get currentSrc() {
      return src;
    },
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    removeAttribute(name) {
      if (name === "src") src = null;
    },
    load() {},
  };
}

/** Wrong pattern: cleanup reads ref after React pointed it at the next video. */
function cleanupViaRef(ref) {
  releaseVideoElement(ref.current);
}

/** #155 / bg-video pattern: capture element when the effect ran. */
function cleanupViaCapture(captured) {
  releaseVideoElement(captured);
}

function rotateStandby(useCapture) {
  const videoA = makeVideo("https://cdn/a.mp4");
  const videoB = makeVideo("https://cdn/b.mp4");
  const ref = { current: videoA };
  const capturedA = videoA;
  ref.current = videoB;
  if (useCapture) cleanupViaCapture(capturedA);
  else cleanupViaRef(ref);
  return videoB;
}

{
  const bad = rotateStandby(false);
  check(
    "mutation: ref-at-cleanup strips next standby video src",
    bad.getAttribute("src") === null
  );
  const good = rotateStandby(true);
  check(
    "capture-at-effect keeps second standby video src",
    good.getAttribute("src") === "https://cdn/b.mp4"
  );
  check(
    "second standby video still playable after rotation",
    good.currentSrc === "https://cdn/b.mp4"
  );
}

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check(
  "standby cleanup captures video ref before release",
  /const videoEl = standbyVideoRef\.current/.test(pageSrc) &&
    /releaseVideoElement\(videoEl\)/.test(pageSrc)
);
check(
  "mutation: standby cleanup via .current fails guard",
  !pageSrc.includes("releaseVideoElement(standbyVideoRef.current)")
);

process.exit(failed);
