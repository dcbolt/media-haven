/**
 * Headless Chromium DOM sampling on /tv — short run, extrapolate hourly growth.
 * Requires running server at BASE (see tests/smoke.mjs).
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CYCLES = Number(process.env.TV_MEMORY_CYCLES ?? 80);
const PAUSE_MS = Number(process.env.TV_MEMORY_PAUSE_MS ?? 150);

function sample(page) {
  return page.evaluate(() => ({
    nodes: document.querySelectorAll("*").length,
    videos: document.querySelectorAll("video").length,
    imgs: document.querySelectorAll("img").length,
    heap:
      typeof performance !== "undefined" &&
      performance.memory &&
      typeof performance.memory.usedJSHeapSize === "number"
        ? performance.memory.usedJSHeapSize
        : null,
  }));
}

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox", "--enable-precise-memory-info"],
});

const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${BASE}/tv?ambience=off`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const before = await sample(page);
for (let i = 0; i < CYCLES; i++) {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(PAUSE_MS);
}
const after = await sample(page);
await browser.close();

const elapsedHours = (CYCLES * PAUSE_MS) / 3600_000;
const nodeDelta = after.nodes - before.nodes;
const videoDelta = after.videos - before.videos;
const heapDelta =
  before.heap != null && after.heap != null ? after.heap - before.heap : null;

const nodePerHour = elapsedHours > 0 ? nodeDelta / elapsedHours : nodeDelta;
const videoPerHour = elapsedHours > 0 ? videoDelta / elapsedHours : videoDelta;
const heapPerHour =
  heapDelta != null && elapsedHours > 0 ? heapDelta / elapsedHours : heapDelta;

const pass =
  Math.abs(nodeDelta) <= 40 &&
  videoDelta <= 4 &&
  (heapDelta == null || heapDelta <= 8 * 1024 * 1024);

console.log(
  JSON.stringify({
    name: "tv memory harness",
    pass,
    detail: {
      cycles: CYCLES,
      before,
      after,
      nodeDelta,
      videoDelta,
      heapDelta,
      extrapolatedPerHour: {
        nodes: Math.round(nodePerHour),
        videos: Math.round(videoPerHour),
        heapBytes: heapPerHour == null ? null : Math.round(heapPerHour),
      },
    },
  })
);

process.exit(pass ? 0 : 1);
