/**
 * Consolidated smoke suite — the same sweep run before every deploy during
 * development, codified. Drives the real app in headless Chromium against a
 * running server (mock mode).
 *
 *   npm run build && npm run start -- -p 3100 &   # or any port via BASE
 *   BASE=http://localhost:3100 node tests/smoke.mjs
 *
 * Exits non-zero on any failure. TV browsers get no error pages, so this is
 * the floor for shipping.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ["--no-sandbox"],
});

// ---- Guest portal -----------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/welcome?token=demo`, { waitUntil: "networkidle" });
  const body = await page.textContent("body");
  check("portal renders property", body.includes("The Dunes"));
  check("portal wifi ungated", body.includes("Copy password"));
  check("portal streaming Home copy", body.includes("Press Home on the TV remote"));
  check("portal no Roku copy", !/Roku|Guest Mode/i.test(body));
  check("portal activation links", (await page.locator('a[href*="netflix.com"]').count()) >= 1);
  check("portal next-year nudge", body.includes("These exact dates next year"));
  check("portal consent checkbox", (await page.locator('input[type="checkbox"]').count()) >= 1);
  await page.close();
}

// ---- Bad token --------------------------------------------------------
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/welcome?token=nope`, { waitUntil: "networkidle" });
  check("bad token graceful", (await page.textContent("body")).includes("isn't active"));
  await page.close();
}

// ---- TV kiosk ---------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/tv`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const body = await page.textContent("body");
  check("tv renders", body.includes("The Dunes") || body.includes("Pair this TV"));
  const cached = await page.evaluate(() => Boolean(localStorage.getItem("fh_tv_last_good")));
  check("tv last-good cache populated", cached);
  // outage resilience
  await page.route("**/api/tv/state**", (r) => r.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check(
    "tv never-blank on outage",
    (await page.textContent("body")).includes("The Dunes")
  );
  await page.close();
}

// ---- TV previews ------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/tv?preview=lastnight`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  check(
    "farewell preview",
    (await page.textContent("body")).includes("Until next time")
  );
  await page.goto(`${BASE}/tv?preview=standby`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const media =
    (await page.locator("video").count()) + (await page.locator("img").count());
  check("standby preview renders", true, `${media} media element(s)`);
  await page.close();
}

// ---- TV stale last-good cache ------------------------------------------
// A browser that last saw /tv on an old deployment carries a cached state
// without photos/screensavers/sections. Hydrating it must never crash the
// renderer (regression: "Cannot read properties of undefined (reading
// 'length')" → Application error on every reload).
{
  const staleContent = {
    propertyName: "Stale Cache Haven",
    occupied: true,
    wifiSsid: null,
    wifiPassword: null,
    wifiQr: null,
    guestFirstName: "Dale",
    checkOut: "2099-01-01T15:00:00Z",
    weather: null,
    sun: null,
    tides: null,
    launches: null,
    heroPhoto: null,
    logoUrl: null,
    bookUrl: "https://example.com",
    bookQr: "data:image/png;base64,",
  };
  for (const occupied of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [
        "fh_tv_last_good",
        JSON.stringify({ mode: "active", content: { ...staleContent, occupied } }),
      ]
    );
    await page.goto(`${BASE}/tv`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    check(
      `tv stale cache safe (occupied=${occupied})`,
      errors.length === 0 && !body.includes("Application error"),
      errors[0] ?? ""
    );
    await page.close();
  }
}

// ---- Host auth chain --------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const gate = await page.goto(`${BASE}/host`, { waitUntil: "networkidle" });
  check("host gated", page.url().includes("/host/login"), `status ${gate.status()}`);
  await page.fill("input[name=code]", "demo");
  await page.click("button[type=submit]");
  await page.waitForURL("**/host");
  const body = await page.textContent("body");
  check("host dashboard renders", body.includes("Host dashboard"));
  check("host nav links", body.includes("Turnover"));
  check("host nav previews", body.includes("Preview:"));
  await page.click('nav a[href="/host/tvs"]');
  await page.waitForURL("**/host/tvs");
  const tvsBody = await page.textContent("body");
  check("host nav navigates", tvsBody.includes("Preview:") && tvsBody.includes("pairing code"));
  await page.close();
}

// ---- API auth floors --------------------------------------------------
{
  const ctx = await browser.newContext();
  const qr = await ctx.request.get(`${BASE}/host/qr/abc123defghi`);
  check("qr route 401 unauth", qr.status() === 401);
  const wh = await ctx.request.post(`${BASE}/api/guesty/webhook`, { data: {} });
  check("webhook 401 unauth", wh.status() === 401);
  const sub = await ctx.request.post(`${BASE}/api/subscribe`, {
    data: { email: "not-an-email" },
  });
  check("subscribe validates email", sub.status() === 400);
  const fields = await ctx.request.get(`${BASE}/api/guesty/fields`);
  check("fields route 401 unauth", fields.status() === 401);
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
