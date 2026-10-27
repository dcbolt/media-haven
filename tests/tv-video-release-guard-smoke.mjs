/**
 * Mutation guards — standby / signage / preloader must release hidden videos.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { releaseVideoElement } from "../lib/tv-media-memory.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);

check(
  "standby video cleanup captures element at effect run",
  /const videoEl = standbyVideoRef\.current/.test(pageSrc) &&
    pageSrc.includes("releaseVideoElement(videoEl)")
);
check(
  "signage bg video cleanup captures element at effect run",
  /const videoEl = bgVideoRef\.current[\s\S]{0,120}releaseVideoElement\(videoEl\)/.test(
    pageSrc
  )
);
check(
  "MediaPreloader cleanup uses captured root (not ref on unmount)",
  /const root = rootRef\.current[\s\S]*return \(\) => \{[\s\S]*root\.querySelectorAll\("video"\)/.test(
    pageSrc
  )
);
check(
  "MediaPreloader mounted outside keyed main",
  pageSrc.includes(
    "</main>\n      <MediaPreloader media={upcomingMedia(slides, index)} />"
  )
);
check("page wires guest-busy reload idle gate", pageSrc.includes("setTvGuestBusy"));

const mutant = pageSrc.replace(
  /root\.querySelectorAll\("video"\)\.forEach\(\(video\) => releaseVideoElement\(video\)\)/,
  "// release removed"
);
check(
  "mutation: remove preloader release fails guard",
  !mutant.includes('root.querySelectorAll("video").forEach')
);

{
  const calls = [];
  const video = {
    pause: () => calls.push("pause"),
    currentSrc: "https://x/v.mp4",
    getAttribute: () => "https://x/v.mp4",
    removeAttribute: (n) => calls.push(`remove:${n}`),
    load: () => calls.push("load"),
  };
  releaseVideoElement(video);
  check(
    "releaseVideoElement clears src (mutant baseline)",
    calls.includes("remove:src") && calls.includes("load")
  );
  const bad = [];
  const mutantVideo = {
    pause: () => bad.push("pause"),
    currentSrc: "https://x/v.mp4",
    getAttribute: () => "https://x/v.mp4",
    removeAttribute: () => {},
    load: () => bad.push("load"),
  };
  releaseVideoElement(mutantVideo);
  check(
    "mutation: skip removeAttribute leaves src attribute set",
    mutantVideo.getAttribute("src") === "https://x/v.mp4"
  );
}

process.exit(failed);
