/**
 * Preloader / standby / bg release behaviour (F-2133) — not source greps.
 */
import {
  applyPreloaderVideoRetention,
  releasePreloaderVideosMatchingUrls,
  releaseVideoElement,
} from "../lib/tv-media-memory.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function makeVideo(initialSrc) {
  let src = initialSrc;
  const calls = [];
  return {
    calls,
    pause() {
      calls.push("pause");
    },
    get currentSrc() {
      return src || "";
    },
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    removeAttribute(name) {
      if (name === "src") {
        calls.push("remove:src");
        src = null;
      }
    },
    load() {
      calls.push("load");
    },
  };
}

function makeRoot(videos) {
  return {
    querySelectorAll(sel) {
      if (sel === "video") return videos;
      if (sel === "img") return [];
      return [];
    },
  };
}

{
  const keep = makeVideo("https://cdn/keep.mp4");
  const drop = makeVideo("https://cdn/drop.mp4");
  const root = makeRoot([keep, drop]);
  releasePreloaderVideosMatchingUrls(root, ["https://cdn/drop.mp4"]);
  check("removed warm url loses src", drop.getAttribute("src") === null);
  check("kept warm url retains src", keep.getAttribute("src") === "https://cdn/keep.mp4");
}

{
  const keep = makeVideo("https://cdn/keep.mp4");
  const drop = makeVideo("https://cdn/drop.mp4");
  const root = makeRoot([keep, drop]);
  applyPreloaderVideoRetention(root, ["https://cdn/keep.mp4"]);
  check("retention keeps upcoming preload src", keep.getAttribute("src") !== null);
  check("retention releases dropped preload src", drop.getAttribute("src") === null);
}

{
  const v = makeVideo("https://cdn/x.mp4");
  releaseVideoElement(v);
  check("releaseVideoElement clears src", v.getAttribute("src") === null);
  const mutant = makeVideo("https://cdn/x.mp4");
  releaseVideoElement({
    ...mutant,
    removeAttribute() {},
  });
  check(
    "mutation: noop removeAttribute leaves src",
    mutant.getAttribute("src") === "https://cdn/x.mp4"
  );
}

process.exit(failed);
