/**
 * F-3731 — headless Chrome against the built /tv: the standby clip is
 * downloaded ONCE into the device cache, the <video> plays a local blob:
 * copy, and a page reload (nightly / self-heal / deploy) costs ZERO clip GETs.
 *
 * page.route disables Chrome's HTTP cache, so every clip byte the page wants
 * shows up here: the same position a 105 MB clip is in on a TV box whose
 * disk cache can't hold it. The clip is served with CORS + Content-Length
 * like Vercel Blob.
 *
 * Catches "the page ignores the local copy" (AUDITOR M10): src stays remote,
 * so the reload re-requests the clip and the blob: checks fail.
 * First play: the remote URL streams immediately while the one download
 * runs (F-3728 never-blank), so the first load may show 1 media GET + 1
 * download GET; after that, 0.
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ??
  (() => {
    const baked = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    if (existsSync(baked)) return baked;
    const found = spawnSync(
      "bash",
      ["-c", 'find "$HOME/.cache/ms-playwright" -name chrome -type f -path "*chrome-linux*" 2>/dev/null | head -1'],
      { encoding: "utf8" }
    ).stdout?.trim();
    return found || baked;
  })();

// Same 1 s VP8 clip as tv-standby-loop-browser.mjs (Playwright Chromium has no H.264).
const WEBM = Buffer.from(
  /const WEBM = Buffer\.from\(\s*"([A-Za-z0-9+/=]+)"/.exec(
    readFileSync(new URL("./tv-standby-loop-browser.mjs", import.meta.url), "utf8")
  )[1],
  "base64"
);
const VIDEO = "https://cdn.example/standby-cache.webm";

const demoState = {
  mode: "demo",
  content: {
    propertyName: "The Dunes",
    occupied: false,
    streaming: [], portalQr: null, bookUrl: "https://thefloridahavens.com", bookQr: null,
    showTurtles: false, upsell: null, playlist: null, takeover: null, vacantPlaylist: null,
    nextYear: null, guestBook: null, extendStay: null, wifiSsid: null, wifiPassword: null,
    wifiQr: null, sections: [], guestFirstName: null, guestLabel: null, checkIn: null,
    checkOut: null, weather: null, sun: null, forecast: null, tides: null, launches: null,
    screensavers: [{ url: VIDEO, type: "video", bytes: WEBM.length }],
    heroPhoto: null, photos: [], logoUrl: null, deviceLabel: null,
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

// Seed last-good state on the FIRST load only; the reload must keep the
// cache meta in localStorage, exactly like a real TV.
await page.addInitScript((s) => {
  try {
    if (!sessionStorage.getItem("__mh_seeded")) {
      localStorage.clear();
      localStorage.setItem("fh_tv_last_good", JSON.stringify({ savedAt: new Date().toISOString(), state: s }));
      sessionStorage.setItem("__mh_seeded", "1");
    }
  } catch {
    /* ignore */
  }
  window.__mhPlays = 0;
  document.addEventListener("playing", () => (window.__mhPlays += 1), true);
}, demoState);

let phase = "first";
const gets = { first: { media: 0, fetch: 0, other: 0 }, reload: { media: 0, fetch: 0, other: 0 } };
await page.route(/\/api\/tv\/state/, (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...demoState, deploy: "test" }) })
);
await page.route(/cdn\.example\/standby-cache\.webm/, (route) => {
  const req = route.request();
  const headers = {
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=2592000",
    "last-modified": "Thu, 29 Oct 2026 03:52:15 GMT",
    "content-type": "video/webm",
    "content-length": String(WEBM.length),
  };
  if (req.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
  const t = req.resourceType();
  gets[phase][t === "media" ? "media" : t === "fetch" ? "fetch" : "other"] += 1;
  return route.fulfill({ status: 200, headers, body: WEBM });
});

const mainSrc = () => document.querySelector(".relative.h-full.bg-black > video")?.getAttribute("src") ?? "";

async function load(fn) {
  await fn();
  await page.waitForFunction(() => document.body.innerText.includes("The Dunes"), { timeout: 20_000 });
  const ok = await page
    .waitForFunction(() => (document.querySelector(".relative.h-full.bg-black > video")?.getAttribute("src") ?? "").startsWith("blob:"), { timeout: 15_000 })
    .then(() => true, () => false);
  await page.waitForFunction(() => window.__mhPlays >= 1, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(3000); // ≥2 loops of the 1 s clip
  return { ok, src: await page.evaluate(mainSrc), plays: await page.evaluate(() => window.__mhPlays) };
}

const first = await load(() => page.goto(`${BASE}/tv?preview=standby&ambience=off&sw=off`, { waitUntil: "domcontentloaded" }));
phase = "reload";
const again = await load(() => page.reload({ waitUntil: "domcontentloaded" }));
await ctx.close();

// F-3729: Cache Storage put() fails (disk full). The page must fall back to
// streaming (today's behaviour) and NOT re-download on every reload — the
// back-off is persisted.
const quota = { media: 0, fetch: 0, other: 0 };
{
  const qctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const q = await qctx.newPage();
  await q.addInitScript((s) => {
    try {
      if (!sessionStorage.getItem("__mh_seeded")) {
        localStorage.clear();
        localStorage.setItem("fh_tv_last_good", JSON.stringify({ savedAt: new Date().toISOString(), state: s }));
        sessionStorage.setItem("__mh_seeded", "1");
      }
    } catch {
      /* ignore */
    }
    Cache.prototype.put = async () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  }, demoState);
  await q.route(/\/api\/tv\/state/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...demoState, deploy: "test" }) })
  );
  await q.route(/cdn\.example\/standby-cache\.webm/, (route) => {
    const req = route.request();
    const headers = { "access-control-allow-origin": "*", "content-type": "video/webm", "content-length": String(WEBM.length) };
    if (req.method() !== "HEAD") {
      const t = req.resourceType();
      quota[t === "media" ? "media" : t === "fetch" ? "fetch" : "other"] += 1;
    }
    return route.fulfill({ status: 200, headers, body: req.method() === "HEAD" ? "" : WEBM });
  });
  await q.goto(`${BASE}/tv?preview=standby&ambience=off&sw=off`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < 10; i++) {
    await q.waitForFunction(() => document.body.innerText.includes("The Dunes"), { timeout: 20_000 });
    await q.waitForTimeout(1500);
    if (i < 9) await q.reload({ waitUntil: "domcontentloaded" });
  }
  await qctx.close();
}
await browser.close();
console.log(`INFO  quota-fail 10 loads: ${JSON.stringify(quota)}`);
check("disk full: 10 loads → 1 download attempt total (persisted back-off)", quota.fetch === 1, JSON.stringify(quota));
check("disk full: still streams (≤1 media GET per load, as today)", quota.media >= 1 && quota.media <= 10, JSON.stringify(quota));

const total = (p) => gets[p].media + gets[p].fetch + gets[p].other;
const detail = `first=${JSON.stringify(gets.first)} reload=${JSON.stringify(gets.reload)} src1=${first.src.slice(0, 30)} src2=${again.src.slice(0, 30)} plays=${first.plays}/${again.plays}`;
console.log(`INFO  ${detail}`);
check("first load: standby <video> plays a local blob: copy", first.ok && first.src.startsWith("blob:"), detail);
check("first load: exactly 1 download GET of the clip", gets.first.fetch === 1, detail);
check("after reload: <video> plays the local blob: copy", again.ok && again.src.startsWith("blob:"), detail);
check("after reload: 0 clip GETs (download-once survives reload)", total("reload") === 0, detail);
check("across load + reload: exactly 1 download GET", gets.first.fetch + gets.reload.fetch === 1, detail);
check("clip played (≥1 play each load)", first.plays >= 1 && again.plays >= 1, detail);
process.exit(failed);
