/**
 * F-2133 — upcoming preload keeps src across slide change; dropped url released.
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

const DEVICE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const VIDEO_A = "https://cdn.example/preload-a.mp4";
const VIDEO_B = "https://cdn.example/preload-b.mp4";
const VIDEO_C = "https://cdn.example/preload-c.mp4";

const demoState = {
  mode: "demo",
  content: {
    propertyName: "The Dunes",
    occupied: true,
    streaming: [],
    portalQr: null,
    bookUrl: "https://thefloridahavens.com",
    bookQr: null,
    showTurtles: false,
    upsell: null,
    playlist: {
      items: [
        { key: "media-a", mediaType: "video", url: VIDEO_A, seconds: 8 },
        { key: "media-b", mediaType: "video", url: VIDEO_B, seconds: 8 },
        { key: "media-c", mediaType: "video", url: VIDEO_C, seconds: 8 },
      ],
    },
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
    screensavers: [{ url: VIDEO_A, type: "video", bytes: 1024 }],
    heroPhoto: null,
    photos: [],
    logoUrl: null,
    deviceLabel: null,
    timing: { slideMs: 3000, fadeMs: 400 },
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

await page.addInitScript(
  ({ state, deviceId }) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("fh_tv_device", deviceId);
      localStorage.setItem(
        "fh_tv_last_good",
        JSON.stringify({ savedAt: new Date().toISOString(), state })
      );
    } catch {
      /* ignore */
    }
  },
  { state: demoState, deviceId: DEVICE_ID }
);

await page.route("**/api/tv/state**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...demoState, deploy: "test-preload" }),
  });
});

await page.goto(`${BASE}/tv?sw=off&ambience=off`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(
  () => document.querySelectorAll("video").length > 0,
  { timeout: 25_000 }
);
await page.waitForTimeout(1500);

function readPreloadVideos() {
  return [...document.querySelectorAll('[aria-hidden="true"].hidden video')].map(
    (v) => v.getAttribute("src") || v.currentSrc || ""
  );
}

const before = await page.evaluate(readPreloadVideos);
check(
  "preloader has at least one upcoming src before advance",
  before.some((s) => s.includes("preload-")),
  before.join(",")
);

await page.keyboard.press("ArrowRight");
await page.waitForTimeout(900);

const after = await page.evaluate(readPreloadVideos);
check(
  "still-upcoming preload keeps src after slide change",
  after.some((s) => s.includes("preload-")),
  after.join(",")
);

const releasedCount = before.filter(
  (s) => s.includes("preload-") && !after.includes(s)
).length;
check(
  "dropped preload url released on slide change",
  releasedCount >= 1 || before.length > after.length
);

check(
  "mutation regression: not all preload videos stripped",
  after.some((s) => s.includes("preload-")),
  `after=${after.join(",")}`
);

await browser.close();
process.exit(failed);
