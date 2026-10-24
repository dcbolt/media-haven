/**
 * Headless: persistent /tv crash + API up → capped reload storm (F-951 / F-956).
 * Uses production error-recovery timings and server-side /tv document load count.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DEVICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
/** Production cap window is 10m — stay inside one window (4th reload is allowed after it slides). */
const RUN_MS = Number(process.env.TV_ERROR_RECOVERY_RUN_MS ?? 10 * 60 * 1000);
/** Initial /tv document + at most 3 capped error-recovery reloads in the window. */
const MAX_LOADS = Number(process.env.TV_ERROR_RECOVERY_MAX_LOADS ?? 4);

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
let serverLoadCount = 0;

page.on("response", (resp) => {
  try {
    const u = new URL(resp.url());
    if (u.pathname !== "/tv") return;
    const h = resp.headers()["x-fh-tv-load-count"];
    if (h !== undefined) serverLoadCount = parseInt(h, 10) || 0;
  } catch {
    /* ignore */
  }
});

await page.goto(
  `${BASE}/tv?__tv_load_reset=1&device=${DEVICE}&ambience=off`,
  { waitUntil: "domcontentloaded", timeout: 120_000 }
);

await page.goto(
  `${BASE}/tv?__tv_crash=1&device=${DEVICE}&ambience=off`,
  { waitUntil: "domcontentloaded", timeout: 120_000 }
);

await page.waitForTimeout(RUN_MS);

const metrics = await page.evaluate(() => ({
  onErrorUi: Boolean(
    document.body?.textContent?.includes("Signage paused briefly")
  ),
  recoveryReloads: (() => {
    try {
      const raw = sessionStorage.getItem("fh_tv_err_recovery_ts");
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 999;
    } catch {
      return 999;
    }
  })(),
}));

await browser.close();

const pass =
  metrics.onErrorUi &&
  serverLoadCount <= MAX_LOADS &&
  metrics.recoveryReloads <= 3;

console.log(
  JSON.stringify({
    name: "tv error recovery harness",
    pass,
    detail: {
      ...metrics,
      loads: serverLoadCount,
      maxLoads: MAX_LOADS,
      runMs: RUN_MS,
    },
  })
);

process.exit(pass ? 0 : 1);
