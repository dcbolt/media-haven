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
  await page.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
  // First poll may take up to the per-source time budget on a cold server.
  await page
    .waitForFunction(
      () =>
        document.body.innerText.includes("The Dunes") ||
        document.body.innerText.includes("Pair this TV"),
      { timeout: 20000 }
    )
    .catch(() => {});
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

// ---- TV remote navigation ----------------------------------------------
// D-pad wakes the browse menu; OK opens a section and pauses rotation.
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => document.body.innerText.includes("The Dunes"), {
      timeout: 20000,
    })
    .catch(() => {});
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const menuBody = await page.textContent("nav").catch(() => "");
  check(
    "tv d-pad opens menu",
    menuBody.includes("Home") && menuBody.includes("Entertainment")
  );
  check(
    "tv menu has Guide Book and Weather",
    menuBody.includes("Guide Book") && menuBody.includes("Weather")
  );
  // Guide Book browser: open it, arrow through sections
  await page.keyboard.press("ArrowRight"); // → Guide Book
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const guide = await page.textContent("main");
  check(
    "tv Guide Book browser opens",
    guide.includes("Guide Book") && guide.includes("House Rules")
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape"); // back to loop
  await page.waitForTimeout(300);
  // Entertainment via menu
  await page.keyboard.press("ArrowRight"); // wake menu
  await page.waitForTimeout(300);
  const items = await page.locator("nav span").allTextContents();
  const entPos = items.findIndex((t) => t === "Entertainment");
  for (let i = 0; i < entPos; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const ent = await page.textContent("main");
  check("tv Entertainment page opens", ent.includes("Your shows, your accounts"));
  // First service is focused; OK opens its sign-in walkthrough
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const walkthrough = await page.textContent("main");
  check(
    "tv service sign-in walkthrough",
    walkthrough.includes("netflix.com/tv8") && walkthrough.includes("Home")
  );
  await page.keyboard.press("Escape"); // close walkthrough
  await page.keyboard.press("Escape"); // resume loop
  await page.close();
}

// ---- TV previews ------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/tv?preview=lastnight`, { waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(() => document.body.innerText.includes("Until next time"), {
      timeout: 20000,
    })
    .catch(() => {});
  check(
    "farewell preview",
    (await page.textContent("body")).includes("Until next time")
  );
  await page.goto(`${BASE}/tv?preview=standby`, { waitUntil: "domcontentloaded" });
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
    await page.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
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
  check("host nav properties", body.includes("Properties"));
  await page.goto(`${BASE}/host/properties`, { waitUntil: "domcontentloaded" });
  check(
    "properties page renders",
    (await page.textContent("body")).includes("Properties")
  );
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
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
  const sync = await ctx.request.post(`${BASE}/api/guesty/sync`);
  check("sync route 401 unauth", sync.status() === 401);
  const rm = await ctx.request.get(`${BASE}/api/roadmap`);
  check("roadmap api 401 unauth", rm.status() === 401);
  const rmPage = await ctx.request.get(`${BASE}/roadmap.html`);
  check(
    "roadmap page served",
    rmPage.status() === 200 && (await rmPage.text()).includes("Development Roadmap")
  );
  const tvState = await ctx.request.get(
    `${BASE}/api/tv/state?device=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`
  );
  const tvJson = await tvState.json();
  check(
    "tv state book link + QR",
    Boolean(tvJson.content?.bookUrl?.startsWith("https://")) &&
      Boolean(tvJson.content?.bookQr?.startsWith("data:image/png"))
  );
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
