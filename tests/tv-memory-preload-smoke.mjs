/**
 * TV memory guard (#155 restore) — preload cap + page wiring + mutants.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  TV_PRELOAD_VIDEO_MAX_BYTES,
  TV_WARM_MEDIA_CAP,
  filterPreloadMedia,
  releaseVideoElement,
  videoEligibleForPreload,
} from "../lib/tv-media-memory.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("warm media cap is 4", TV_WARM_MEDIA_CAP === 4);
check("preload video cap is ~50MB", TV_PRELOAD_VIDEO_MAX_BYTES === 50 * 1024 * 1024);

check(
  "images always preload",
  videoEligibleForPreload({ url: "https://x/a.jpg", type: "image" })
);
check(
  "small video preloads",
  videoEligibleForPreload({
    url: "https://x/v.mp4",
    type: "video",
    bytes: TV_PRELOAD_VIDEO_MAX_BYTES - 1,
  })
);
check(
  "oversized video skipped",
  !videoEligibleForPreload({
    url: "https://x/huge.mp4",
    type: "video",
    bytes: TV_PRELOAD_VIDEO_MAX_BYTES + 1,
  })
);
check(
  "tooLargeForTv skipped",
  !videoEligibleForPreload({
    url: "https://x/v.mp4",
    type: "video",
    tooLargeForTv: true,
  })
);
check(
  "unknown video bytes still preloads (no cap without size)",
  videoEligibleForPreload({
    url: "https://x/unknown.mp4",
    type: "video",
  })
);

check(
  "filter drops oversized only",
  filterPreloadMedia([
    { url: "https://x/a.jpg", type: "image" },
    {
      url: "https://x/huge.mp4",
      type: "video",
      bytes: TV_PRELOAD_VIDEO_MAX_BYTES + 1,
    },
  ]).length === 1
);

// releaseVideoElement clears src (mutation: noop load leaves attribute).
{
  const calls = [];
  const video = {
    pause() {
      calls.push("pause");
    },
    currentSrc: "https://x/v.mp4",
    getAttribute() {
      return "https://x/v.mp4";
    },
    removeAttribute(name) {
      calls.push(`remove:${name}`);
    },
    load() {
      calls.push("load");
    },
  };
  releaseVideoElement(video);
  check(
    "releaseVideoElement removes src and loads",
    calls.includes("remove:src") && calls.includes("load")
  );
  const mutant = [];
  const badVideo = {
    pause: () => mutant.push("pause"),
    currentSrc: "https://x/v.mp4",
    getAttribute: () => "https://x/v.mp4",
    removeAttribute: () => {},
    load: () => mutant.push("load"),
  };
  releaseVideoElement(badVideo);
  check(
    "mutation: skip removeAttribute still calls load (incomplete release)",
    !mutant.includes("remove:src") && mutant.includes("load")
  );
}

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check("page uses tvWarmMediaRegistry", pageSrc.includes("tvWarmMediaRegistry"));
check("page uses releaseVideoElement", pageSrc.includes("releaseVideoElement"));
check("page filters preload media", pageSrc.includes("filterPreloadMedia"));

const mutantPage = pageSrc.replace(/tvWarmMediaRegistry/g, "");
check(
  "mutation: deleting registry wiring fails guard",
  !mutantPage.includes("tvWarmMediaRegistry")
);

process.exit(failed);
