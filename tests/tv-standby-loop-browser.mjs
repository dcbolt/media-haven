/**
 * Blob transfer leak (2026-10-29) — headless Chrome against the built /tv:
 * the standby clip is fetched once, not once per play.
 *
 * Request counting goes through page.route, which disables Chrome's HTTP
 * cache — the same position a 105 MB clip is in on a TV box whose disk cache
 * cannot hold it. Images 404 so their onError advances instantly, which turns
 * a 45s photo dwell into a fast rotation back to the video.
 *
 * Negative control: run with BASE pointed at a build of the pre-fix commit —
 * "loops natively" and "fetch count flat" must FAIL there.
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

const VIDEO = "https://cdn.example/standby-loop.webm";
const IMG1 = "https://cdn.example/missing-1.jpg";
const IMG2 = "https://cdn.example/missing-2.jpg";
// 1s 64x36 VP8 clip (3.6 KB) — Playwright Chromium has no H.264.
const WEBM = Buffer.from(
  "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",
  "base64"
);

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
    screensavers: [],
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
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});

async function scenario(label, screensavers, ms) {
  const state = { ...demoState, content: { ...demoState.content, screensavers } };
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const hits = { video: 0, image: 0 };
  await page.addInitScript((s) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        "fh_tv_last_good",
        JSON.stringify({ savedAt: new Date().toISOString(), state: s })
      );
    } catch {
      /* ignore */
    }
    window.__mhPlays = 0;
    document.addEventListener("playing", () => (window.__mhPlays += 1), true);
  }, state);
  await page.route(/\/api\/tv\/state/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...state, deploy: "test" }),
    })
  );
  await page.route(/cdn\.example\/.*\.webm/, (route) => {
    hits.video += 1;
    return route.fulfill({ status: 200, contentType: "video/webm", body: WEBM });
  });
  await page.route(/cdn\.example\/.*\.jpg/, (route) => {
    hits.image += 1;
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(`${BASE}/tv?preview=standby&ambience=off&sw=off`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => document.body.innerText.includes("The Dunes"), {
    timeout: 20_000,
  });
  await page.waitForFunction(() => window.__mhPlays >= 1, { timeout: 15_000 }).catch(() => {});
  const mark = await page.evaluate(() => {
    const v = document.querySelector(".relative.h-full.bg-black > video");
    if (v) v.__mhMark = "first";
    return {
      loop: Boolean(v?.loop),
      preloadAuto: [...document.querySelectorAll("video")].some(
        (x) => x.getAttribute("preload") === "auto"
      ),
    };
  });
  const hitsAfterFirstPlay = hits.video;
  await page.waitForTimeout(ms);
  const end = await page.evaluate(() => {
    const v = document.querySelector(".relative.h-full.bg-black > video");
    return {
      plays: window.__mhPlays,
      sameElement: v?.__mhMark === "first",
      hasSrc: Boolean(v?.getAttribute("src")),
    };
  });
  await page.close();
  const detail = `plays=${end.plays} videoFetches=${hits.video} (after first play ${hitsAfterFirstPlay}) imageHits=${hits.image}`;
  console.log(`INFO  ${label}: ${detail}`);
  return { ...mark, ...end, hits, hitsAfterFirstPlay, detail };
}

{
  const r = await scenario("single", [{ url: VIDEO, type: "video" }], 3500);
  check("single video: loops natively", r.loop, r.detail);
  check("single video: replays (≥2 plays of the 1s clip in 3.5s)", r.plays >= 2 && r.hasSrc, r.detail);
  check("single video: same element, src kept", r.sameElement && r.hasSrc, r.detail);
  check("single video: fetch count flat after first play", r.hits.video === r.hitsAfterFirstPlay, r.detail);
  check('single video: no preload="auto" video', !r.preloadAuto, r.detail);
}

{
  const r = await scenario(
    "mixed",
    [
      { url: VIDEO, type: "video" },
      { url: IMG1, type: "image" },
      { url: IMG2, type: "image" },
    ],
    6000
  );
  check("video + photos: rotation really cycled (≥3 plays)", r.plays >= 3, r.detail);
  check("video + photos: same element, src kept across photos", r.sameElement && r.hasSrc, r.detail);
  check(
    "video + photos: video fetched ≤2 times across all plays",
    r.hits.video <= 2,
    r.detail
  );
}

// F-3461 never-blank: the mounted video fails (404) while hidden under a
// photo. On its turn it must be skipped (as base did), and its hidden error
// must not cut the current photo short (M8: onError always advances).
{
  const SLOW = "https://err.example/slow-404.jpg";
  const MISSING = "https://err.example/missing.webm";
  const GOOD = "https://err.example/good.png";
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP438AAAAQBAYDFKhhdAAAAAElFTkSuQmCC", "base64");
  const state = {
    ...demoState,
    content: {
      ...demoState.content,
      screensavers: [
        { url: SLOW, type: "image" },
        { url: MISSING, type: "video" },
        { url: GOOD, type: "image" },
      ],
    },
  };
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const hits = { video: 0 };
  await page.addInitScript((st) => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(
        "fh_tv_last_good",
        JSON.stringify({ savedAt: new Date().toISOString(), state: st })
      );
    } catch {
      /* ignore */
    }
  }, state);
  await page.route(/\/api\/tv\/state/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...state, deploy: "test" }),
    })
  );
  await page.route(SLOW, async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    return route.fulfill({ status: 404, body: "" }).catch(() => {});
  });
  // Delay the 404 a little so it lands after hydration (handler attached)
  // but still well before the slow photo's own 404.
  await page.route(MISSING, async (route) => {
    hits.video += 1;
    await new Promise((r) => setTimeout(r, 700));
    return route.fulfill({ status: 404, body: "" }).catch(() => {});
  });
  await page.route(GOOD, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );
  await page.goto(`${BASE}/tv?preview=standby&ambience=off&sw=off`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => document.body.innerText.includes("The Dunes"), {
    timeout: 20_000,
  });
  // Sample what is on screen every 100ms so a photo cut short is visible.
  const t0 = Date.now();
  const samples = [];
  const sampler = setInterval(() => {
    page
      .evaluate(() => {
        const root = document.querySelector(".relative.h-full.bg-black");
        return root?.querySelector(":scope > img")?.getAttribute("src") ?? "none";
      })
      .then((src) => samples.push([Date.now() - t0, src]))
      .catch(() => {});
  }, 100);
  const read = () =>
    page.evaluate(() => {
      const root = document.querySelector(".relative.h-full.bg-black");
      const img = root?.querySelector(":scope > img");
      const v = root?.querySelector(":scope > video");
      const videoVisible = Boolean(v && getComputedStyle(v).display !== "none");
      return {
        img: img?.getAttribute("src") ?? null,
        videoVisible,
        videoError: v?.error?.code ?? null,
      };
    });
  // The hidden video's 404 lands well before the slow photo's (2.5s).
  await page.waitForTimeout(1200);
  const early = await read();
  await page.waitForTimeout(4300);
  const late = await read();
  clearInterval(sampler);
  await page.close();
  const slowLeftAt = samples.find(([, src]) => src !== SLOW)?.[0] ?? null;
  const d = `early=${JSON.stringify(early)} late=${JSON.stringify(late)} slowPhotoLeftAtMs=${slowLeftAt} videoFetches=${hits.video}`;
  console.log(`INFO  hidden-error: ${d}`);
  check(
    "hidden video error does not cut the current photo short (M8)",
    early.img === SLOW && !early.videoVisible && slowLeftAt !== null && slowLeftAt >= 2000,
    d
  );
  check(
    "failed hidden video is skipped on its turn → next photo shows (F-3461)",
    late.img === GOOD && !late.videoVisible,
    d
  );
  check("failed video retried at most once per skipped turn", hits.video <= 3, d);
}

await browser.close();
process.exit(failed);
