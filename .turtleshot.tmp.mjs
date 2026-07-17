import { chromium } from "playwright-core";
const OUT = "/tmp/claude-0/-home-user-media-haven/1ba01514-ef07-51e3-a126-17b31522e6a8/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("http://localhost:3100/tv", { waitUntil: "domcontentloaded" });
await p.waitForFunction(
  () => document.body.innerText.includes("Hatchlings are emerging"),
  null, { timeout: 400000 }
);
await p.waitForTimeout(1500);
await p.screenshot({ path: `${OUT}/tv-turtles.png` });
console.log("turtle slide captured");
await b.close();
