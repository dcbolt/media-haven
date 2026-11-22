import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

function resolveChromiumPath() {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const found = spawnSync(
    "bash",
    [
      "-c",
      'find "$HOME/.cache/ms-playwright" -name chrome -type f -path "*chrome-linux*" 2>/dev/null | head -1',
    ],
    { encoding: "utf8" }
  ).stdout?.trim();
  return found;
}

const BASE = process.env.BASE || "http://127.0.0.1:3001";
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: resolveChromiumPath(),
  args: ["--no-sandbox"],
});

for (const { w, name } of [
  { w: 1440, name: "host-tvs-fleet-1440" },
  { w: 390, name: "host-tvs-fleet-390" },
]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto(`${BASE}/host/login`, { waitUntil: "domcontentloaded" });
  await page.fill("input[name=code]", "demo");
  await page.click("button[type=submit]");
  await page.waitForURL("**/host**");
  await page.goto(`${BASE}/host/tvs/fixture-preview`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=Turtle Haven", { timeout: 15000 });
  await page.screenshot({
    path: `${outDir}/${name}.png`,
    fullPage: true,
  });
  await page.close();
}

await browser.close();
console.log("screenshots saved to", outDir);