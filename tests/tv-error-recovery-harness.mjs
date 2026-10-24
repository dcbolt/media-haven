/**
 * Headless: persistent /tv crash + API up → capped reload storm (F-951).
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const DEVICE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const RUN_MS = Number(process.env.TV_ERROR_RECOVERY_RUN_MS ?? 20_000);
const MAX_RECOVERY_RELOADS = Number(process.env.TV_ERROR_RECOVERY_MAX_RELOADS ?? 3);

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
await page.addInitScript(() => {
  globalThis.__TV_ERROR_RECOVERY_FAST__ = true;
});

await page.goto(
  `${BASE}/tv?__tv_crash=1&device=${DEVICE}&ambience=off`,
  { waitUntil: "domcontentloaded", timeout: 60_000 }
);

await page.waitForTimeout(RUN_MS);

const metrics = await page.evaluate(() => {
  let recoveryReloads = 0;
  try {
    const raw = sessionStorage.getItem("fh_tv_err_recovery_ts");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) recoveryReloads = arr.length;
    }
  } catch {
    recoveryReloads = 999;
  }
  const navEntries = performance.getEntriesByType("navigation");
  return {
    recoveryReloads,
    navigations: navEntries.length,
    onErrorUi: Boolean(
      document.body?.textContent?.includes("Signage paused briefly")
    ),
  };
});

await browser.close();

const pass =
  metrics.onErrorUi &&
  metrics.recoveryReloads <= MAX_RECOVERY_RELOADS &&
  metrics.navigations <= MAX_RECOVERY_RELOADS + 2;

console.log(
  JSON.stringify({
    name: "tv error recovery harness",
    pass,
    detail: { ...metrics, maxRecoveryReloads: MAX_RECOVERY_RELOADS, runMs: RUN_MS },
  })
);

process.exit(pass ? 0 : 1);
