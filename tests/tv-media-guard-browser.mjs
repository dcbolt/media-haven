/**
 * F-1146 — headless Chrome: standby two-video rotation keeps next src.
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ??
  (() => {
    const baked = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    if (existsSync(baked)) return baked;
    const found = spawnSync(
      "bash",
      [
        "-c",
        'find "$HOME/.cache/ms-playwright" -name chrome -type f -path "*chrome-linux*" 2>/dev/null | head -1',
      ],
      { encoding: "utf8" }
    ).stdout?.trim();
    return found || baked;
  })();

const VIDEO_A = "https://cdn.example/standby-a.mp4";
const VIDEO_B = "https://cdn.example/standby-b.mp4";

const demoState = {
  mode: "demo",
  content: {
    propertyName: "The Dunes",
    occupied: false,
    streaming: [],
    portalQr: null,
    bookUrl: "https://thefloridahavens.com",
    bookQr: null,
    showTurtles: false,
    upsell: null,
    playlist: null,
    takeover: null,
    vacantPlaylist: null,
    nextYear: null,
    guestBook: null,
    extendStay: null,
    wifiSsid: null,
    wifiPassword: null,
    wifiQr: null,
    sections: [],
    guestFirstName: null,
    guestLabel: null,
    checkIn: null,
    checkOut: null,
    weather: null,
    sun: null,
    forecast: null,
    tides: null,
    launches: null,
    screensavers: [
      { url: VIDEO_A, type: "video", bytes: 1024 },
      { url: VIDEO_B, type: "video", bytes: 1024 },
    ],
    heroPhoto: null,
    photos: [],
    logoUrl: null,
    deviceLabel: null,
    timing: { slideMs: 20000, fadeMs: 2500 },
    ambience: { enabled: false, bed: "rotate", volumePercent: 16 },
  },
};

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.addInitScript((state) => {
  try {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      "fh_tv_last_good",
      JSON.stringify({ savedAt: new Date().toISOString(), state })
    );
  } catch {
    /* ignore */
  }
}, demoState);

await page.route(/\/api\/tv\/state/, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...demoState, deploy: "test" }),
  });
});

await page.goto(`${BASE}/tv?preview=standby&ambience=off&sw=off`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => document.body.innerText.includes("The Dunes"), {
  timeout: 20_000,
});
await page.waitForTimeout(2500);

function readVideos() {
  return [...document.querySelectorAll("video")].map((v) => ({
    src: v.getAttribute("src") || v.currentSrc || "",
    inPreloader: Boolean(v.closest('[aria-hidden="true"].hidden')),
  }));
}

const beforeAdvance = await page.evaluate(readVideos);
const mainBefore = beforeAdvance.find((v) => !v.inPreloader && v.src);
const preloadBefore = beforeAdvance.find((v) => v.inPreloader && v.src);

check(
  "standby main video has src",
  Boolean(mainBefore?.src.includes("standby-")),
  mainBefore?.src ?? "none"
);
check(
  "preloader warms the other video",
  Boolean(
    preloadBefore?.src.includes("standby-") &&
      preloadBefore.src !== mainBefore?.src
  ),
  `main=${mainBefore?.src} preload=${preloadBefore?.src}`
);

for (let i = 0; i < 2; i++) {
  await page.evaluate(() => {
    const main = document.querySelector(".relative.h-full.bg-black > video");
    main?.dispatchEvent(new Event("ended"));
  });
  await page.waitForTimeout(600);
}

const afterAdvance = await page.evaluate(readVideos);
const mainAfter = afterAdvance.find((v) => !v.inPreloader && v.src);
const preloadAfter = afterAdvance.find((v) => v.inPreloader && v.src);

check(
  "after rotation main video still has src (F-1134)",
  Boolean(mainAfter?.src.includes("standby-")),
  mainAfter?.src ?? "none"
);
check(
  "preloaded next video kept src after rotation",
  Boolean(preloadAfter?.src.includes("standby-")),
  preloadAfter?.src ?? "none"
);
check(
  "two-video standby retains two src-bearing videos in DOM",
  afterAdvance.filter((v) => v.src.includes("standby-")).length >= 2
);

await browser.close();
process.exit(failed);
