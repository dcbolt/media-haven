/**
 * F-1145 — resolved URL comparison for preload retention.
 */
import { applyPreloaderVideoRetention } from "../lib/tv-media-memory.ts";
import { resolveTvMediaUrl, tvMediaUrlSet } from "../lib/tv-media-url.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const base = "https://tv.example/tv";
check(
  "relative resolves against page base",
  resolveTvMediaUrl("/media/a.mp4", base) === "https://tv.example/media/a.mp4"
);

const set = tvMediaUrlSet(["/media/a.mp4"], base);
check("set contains resolved relative", set.has("https://tv.example/media/a.mp4"));

{
  let src = "/media/next.mp4";
  const video = {
    get currentSrc() {
      return "https://tv.example/media/next.mp4";
    },
    getAttribute(name) {
      return name === "src" ? src : null;
    },
    removeAttribute(name) {
      if (name === "src") src = "";
    },
    load() {},
    pause() {},
  };
  const root = {
    querySelectorAll(sel) {
      if (sel === "video") return [video];
      if (sel === "img") return [];
      return [];
    },
  };
  applyPreloaderVideoRetention(root, ["https://tv.example/media/other.mp4"], base);
  check("non-keep video src released with resolved compare", src === "");
  src = "/media/keep.mp4";
  applyPreloaderVideoRetention(root, ["/media/keep.mp4"], base);
  check("keep video retains src via relative/absolute match", src !== "");
}

process.exit(failed);
