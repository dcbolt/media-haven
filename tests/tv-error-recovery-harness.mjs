/**
 * Headless: persistent /tv crash + API up → capped reload storm (F-951).
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DEVICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const RUN_MS = Number(process.env.TV_ERROR_RECOVERY_RUN_MS ?? 20_000);
const MAX_LOADS = Number(process.env.TV_ERROR_RECOVERY_MAX_LOADS ?? 5);

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"],
});

let loads = 0;
const context = await browser.newContext();
context.on("page", (p) => {
  p.on("load", () => {
    loads += 1;
  });
});

const page = await context.newPage();
await page.addInitScript(() => {
  globalThis.__TV_ERROR_RECOVERY_FAST__ = true;
});

await page.goto(
  `${BASE}/tv?__tv_crash=1&device=${DEVICE}&ambience=off`,
  { waitUntil: "domcontentloaded", timeout: 60_000 }
);

await page.waitForTimeout(RUN_MS);
await browser.close();

const pass = loads <= MAX_LOADS;

console.log(
  JSON.stringify({
    name: "tv error recovery harness",
    pass,
    detail: { loads, maxLoads: MAX_LOADS, runMs: RUN_MS },
  })
);

process.exit(pass ? 0 : 1);
