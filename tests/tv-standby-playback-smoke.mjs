/**
 * Blob transfer leak (2026-10-29) — standby clip must not refetch per play.
 *
 * Negative control: `legacyPlan` reproduces the pre-fix Standby (element keyed
 * on the current asset, no loop, preloader warms the next video with
 * preload="auto"). The same assertions that pass for standbyPlaybackPlan must
 * FAIL for legacyPlan, or this test is not measuring anything.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  dedupeStandbyAssets,
  simulateStandbyFetches,
  standbyPlaybackPlan,
} from "../lib/tv-standby-playback.ts";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const DRONE = { url: "https://blob.example/screensavers/drone.mp4", type: "video" };
const OTHER = { url: "https://blob.example/screensavers/other.mp4", type: "video" };
const IMG1 = { url: "https://drive.example/a.jpg", type: "image" };
const IMG2 = { url: "https://drive.example/b.jpg", type: "image" };

/** Pre-fix Standby, modelled (see git history of app/tv/page.tsx Standby). */
function legacyPlan(assets, index) {
  const n = assets.length;
  if (n === 0) return { videoUrl: null, loopVideo: false, warmNext: null, length: 0, remountKey: null };
  const asset = assets[index % n];
  const next = n > 1 ? assets[(index + 1) % n] : null;
  return {
    videoUrl: asset.type === "video" ? asset.url : null,
    remountKey: asset.type === "video" ? asset.url : null, // key={asset.url}
    loopVideo: false,
    warmNext: next,
    warmPreload: "auto",
    length: n,
  };
}

/** Wrap the real plan with the real preload mode the page renders. */
function newPlan(assets, index) {
  return { ...standbyPlaybackPlan(assets, index), warmPreload: "metadata" };
}

const PLAYS = 50;

/** The properties the fix must hold; returns [name, pass, detail][] */
function assertions(planFn) {
  const out = [];
  const single = simulateStandbyFetches(planFn, [DRONE], PLAYS);
  out.push(["single video loops natively", single.loops === true, JSON.stringify(single)]);
  out.push([
    `single video: ≤1 full fetch over ${PLAYS} plays`,
    single.videoFetches + single.preloadFetches <= 1,
    JSON.stringify(single),
  ]);
  const mixed = simulateStandbyFetches(planFn, [DRONE, IMG1, IMG2], PLAYS * 3);
  out.push([
    `video + photos: ≤1 full fetch over ${PLAYS} rotations`,
    mixed.videoFetches + mixed.preloadFetches <= 1,
    JSON.stringify(mixed),
  ]);
  const dup = simulateStandbyFetches(planFn, [DRONE, DRONE, IMG1], PLAYS * 3);
  out.push([
    "duplicate URL in playlist: ≤1 full fetch",
    dup.videoFetches + dup.preloadFetches <= 1,
    JSON.stringify(dup),
  ]);
  return out;
}

for (const [name, pass, detail] of assertions(newPlan)) check(name, pass, detail);

// Negative control: every fix assertion must fail on the legacy model.
{
  const legacy = assertions(legacyPlan);
  // Legacy single-video never refetched — it froze on the last frame (no
  // loop, advance() was a no-op). Its control is the loop assertion.
  const mustFail = new Set([
    "single video loops natively",
    `video + photos: ≤1 full fetch over ${PLAYS} rotations`,
    "duplicate URL in playlist: ≤1 full fetch",
  ]);
  for (const [name, pass, detail] of legacy) {
    if (!mustFail.has(name)) {
      console.log(`INFO  legacy "${name}" — ${detail}`);
      continue;
    }
    check(`negative control: legacy fails "${name}"`, pass === false, detail);
  }
}

// Two distinct videos still rotate (real src change — #167 F-1134 path).
{
  const two = simulateStandbyFetches(newPlan, [DRONE, OTHER], 4);
  check("two videos rotate with a real src change each turn", two.videoFetches === 4, JSON.stringify(two));
  const p0 = standbyPlaybackPlan([DRONE, OTHER], 0);
  check("two videos: preloader may warm the other video", p0.warmNext?.url === OTHER.url);
  check("two videos: no native loop", p0.loopVideo === false);
}

// Plan shape.
{
  const p = standbyPlaybackPlan([DRONE, IMG1], 1);
  check("mixed: video stays mounted while photo shows", p.videoUrl === DRONE.url && p.videoVisible === false);
  check("mixed: preloader never warms the mounted video", standbyPlaybackPlan([IMG1, DRONE], 0).warmNext === null);
  check("dedupe keeps first-seen order", dedupeStandbyAssets([DRONE, IMG1, DRONE]).map((a) => a.url).join() === [DRONE.url, IMG1.url].join());
  check("empty playlist → no video", standbyPlaybackPlan([], 0).videoUrl === null);
}

// Page wiring guards + mutants.
const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
const standby = pageSrc.slice(
  pageSrc.indexOf("function Standby("),
  pageSrc.indexOf("function StreamInputOverlay(")
);
const guards = {
  "Standby uses standbyPlaybackPlan": (src) => src.includes("standbyPlaybackPlan(assets, assetIndex)"),
  "Standby video keyed on videoUrl (not asset.url)": (src) => /key=\{videoUrl\}/.test(src) && !/key=\{asset\.url\}\s*\n\s*ref=\{standbyVideoRef\}/.test(src),
  "Standby video loops natively": (src) => src.includes("loop={loopVideo}"),
  "Standby release keyed on videoUrl": (src) => /releaseVideoElement\(videoEl\);[\s\S]{0,80}\}, \[videoUrl\]\)/.test(src),
};
for (const [name, fn] of Object.entries(guards)) check(name, fn(standby));
check('no preload="auto" anywhere in app/tv/page.tsx', !pageSrc.includes('preload="auto"'));

const mutants = [
  ["drop loop", standby.replace("loop={loopVideo}", ""), "Standby video loops natively"],
  ["key on asset.url", standby.replace("key={videoUrl}", "key={asset.url}"), "Standby video keyed on videoUrl (not asset.url)"],
  ["release per asset", standby.replace("}, [videoUrl]);\n\n  // Photos", "}, [asset?.url]);\n\n  // Photos"), "Standby release keyed on videoUrl"],
];
for (const [label, src, guard] of mutants) {
  check(`mutation (${label}) caught by "${guard}"`, src !== standby && guards[guard](src) === false);
}
check(
  'mutation (preload="auto") caught',
  pageSrc.replace('preload="metadata" muted', 'preload="auto" muted').includes('preload="auto"')
);

process.exit(failed);
