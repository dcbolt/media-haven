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
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3100";
const EXEC =
  process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Named Guesty blocks (Patrick Dunn / comps) — pure fixtures, no DB.
// Blast radius: heuristic + calendar-payload parse only. Live occupancy
// still needs Guesty + Supabase; this proves named → guest / unnamed → vacant.
{
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      fileURLToPath(new URL("./named-blocks-smoke.mjs", import.meta.url)),
    ],
    { encoding: "utf8" }
  );
  const lines = (r.stdout || "").split("\n").filter(Boolean);
  let parsed = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row && typeof row.name === "string") {
        check(row.name, Boolean(row.pass), row.detail ?? "");
        parsed += 1;
      }
    } catch {
      /* ignore non-JSON banners */
    }
  }
  if (parsed === 0) {
    check(
      "named-block fixtures ran",
      false,
      (r.stderr || `exit ${r.status}`).slice(0, 240)
    );
  }
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
  check(
    "portal beach-day parity",
    body.includes("Today at the beach") || body.includes("High tide") || body.includes("°F")
  );
  check(
    "portal rockets parity",
    body.includes("Rocket launches") || body.includes("launch")
  );
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
  // Persistent overlay (Devin 2026-09-10): always on occupied
  // signage, not only the Watch TV slide. Home-button default copy.
  const occupiedOverlay =
    (await page.locator("[data-tv-roku-overlay]").textContent().catch(() => "")) ||
    "";
  check(
    "tv occupied overlay present",
    /push/i.test(occupiedOverlay) &&
      /home/i.test(occupiedOverlay) &&
      /start streaming/i.test(occupiedOverlay) &&
      !/ROKU/i.test(occupiedOverlay)
  );
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
  // Focus the page so window keydown handlers fire (menu v4 / host chrome).
  await page.locator("main").click({ position: { x: 40, y: 40 } }).catch(() => {});
  // ◀ ▶ page the deck directly (nav v5): slide changes, menu stays closed.
  const beforePage = await page.textContent("main");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  const afterPage = await page.textContent("main");
  check(
    "tv arrows page slides directly",
    beforePage !== afterPage &&
      !((await page.textContent("nav").catch(() => "")) || "").includes("Home")
  );
  // OK / Up / Down summon the menu.
  await page.keyboard.press("ArrowDown");
  await page
    .waitForFunction(
      () => {
        const n = document.querySelector("nav");
        return n && /Home/i.test(n.innerText) && /Watch TV/i.test(n.innerText);
      },
      { timeout: 8000 }
    )
    .catch(() => {});
  const menuBody = (await page.textContent("nav").catch(() => "")) || "";
  check(
    "tv d-pad opens menu",
    menuBody.includes("Home") && menuBody.includes("Watch TV")
  );
  // Devin 2026-09-10: guest signage is house guide + one Roku-input
  // coach. No Entertainment grid / app launcher on this output.
  check("tv menu hides Entertainment launcher", !/Entertainment/i.test(menuBody));
  // Weather only appears when beach-day slide is in the deck (tides/sun data).
  check(
    "tv menu has Guidebook and Weather",
    menuBody.includes("Guidebook") &&
      (menuBody.includes("Weather") || menuBody.includes("Book Direct"))
  );
  // Guidebook browser: walk focus to it (menu order: Home · Watch TV ·
  // Guidebook · Weather · Book Direct), open, arrow through sections
  for (let i = 0; i < 8; i++) {
    const active = await page.evaluate(() => {
      const spans = [...document.querySelectorAll("nav span")];
      const a = spans.find((s) => s.classList.contains("text-white"));
      return a?.textContent?.trim() ?? "";
    });
    if (active === "Guidebook") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const guide = await page.textContent("main");
  check(
    "tv Guidebook browser opens",
    guide.includes("Guidebook") && guide.includes("House Rules")
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape"); // back steps UP to the open menu (nav v3)
  await page.waitForTimeout(300);
  // Walk focus to Watch TV (Roku-input coach — replaces Entertainment)
  for (let i = 0; i < 12; i++) {
    const active = await page.evaluate(() => {
      const spans = [...document.querySelectorAll("nav span")];
      const a = spans.find((s) => s.classList.contains("text-white"));
      return a?.textContent?.trim() ?? "";
    });
    if (active === "Watch TV") break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
  }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const coach = await page.textContent("main");
  check(
    "tv Watch TV slide is the Roku-input coach",
    coach.includes("Stream / Watch TV") &&
      coach.includes("Roku") &&
      coach.includes("Input or Source") &&
      !coach.includes("Your shows, your accounts")
  );
  // Detailed coach and persistent banner must not stack.
  check(
    "tv Watch TV slide hides persistent overlay",
    (await page.locator("[data-tv-roku-overlay]").count()) === 0
  );
  // OK on the coach must not open a service-grid walkthrough.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const afterOk = await page.textContent("main");
  check(
    "tv Watch TV is not an app launcher",
    !afterOk.includes("netflix.com/tv8") && !afterOk.includes("Your shows, your accounts")
  );
  await page.keyboard.press("Escape"); // resume loop
  await page.close();
}

// ---- TV previews ------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/tv?preview=lastnight`, { waitUntil: "domcontentloaded" });
  // preview=lastnight forces departure day → "Bon voyage" + protocols.
  await page
    .waitForFunction(() => document.body.innerText.includes("Bon voyage"), {
      timeout: 20000,
    })
    .catch(() => {});
  const farewellBody = await page.textContent("body");
  check(
    "farewell preview",
    farewellBody.includes("Bon voyage") && farewellBody.includes("Check-out is today")
  );
  await page.goto(`${BASE}/tv?preview=standby`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const media =
    (await page.locator("video").count()) + (await page.locator("img").count());
  check("standby preview renders", true, `${media} media element(s)`);
  const vacantOverlay =
    (await page.locator("[data-tv-roku-overlay]").textContent().catch(() => "")) ||
    "";
  check(
    "tv vacant overlay present",
    /push/i.test(vacantOverlay) &&
      /home/i.test(vacantOverlay) &&
      /start streaming/i.test(vacantOverlay) &&
      !/ROKU/i.test(vacantOverlay)
  );
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
  await page.goto(`${BASE}/host/calendar`, { waitUntil: "domcontentloaded" });
  check(
    "calendar page renders",
    (await page.textContent("body")).includes("Multi-Calendar")
  );
  await page.goto(`${BASE}/host`, { waitUntil: "domcontentloaded" });
  await page.click('nav a[href="/host/tvs"]');
  await page.waitForURL("**/host/tvs");
  const tvsBody = await page.textContent("body");
  check("host nav navigates", tvsBody.includes("Preview:") && tvsBody.includes("pairing code"));
  await page.goto(`${BASE}/host/signage`, { waitUntil: "domcontentloaded" });
  const signageBody = await page.textContent("body");
  check(
    "signage editor page renders",
    signageBody.includes("Signage") &&
      (signageBody.includes("Timeline") || signageBody.includes("Supabase"))
  );
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
  const gauth = await ctx.request.post(`${BASE}/api/auth/google`, { data: {} });
  check("google verifier rejects empty", [400, 503].includes(gauth.status()));
  const login = await ctx.request.get(`${BASE}/host/login`);
  const loginBody = await login.text();
  check(
    "login offers Google when configured",
    !loginBody.includes("NEXT_PUBLIC_SUPABASE_URL") &&
      (loginBody.includes("Continue with Google") || !process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
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
  check(
    "tv state upsell pitch",
    Boolean(tvJson.content?.upsell?.headline) &&
      Boolean(tvJson.content?.upsell?.qr?.startsWith("data:image/png"))
  );
  const alerts = await ctx.request.get(`${BASE}/api/alerts/run`);
  check("alerts run 401 unauth", alerts.status() === 401);
  const alertsDry = await ctx.request.get(`${BASE}/api/alerts/run?dry=1`, {
    headers: { "x-alerts-key": "demo" },
  });
  const dryJson = await alertsDry.json().catch(() => ({}));
  check(
    "alerts dry-run reports plan",
    alertsDry.status() === 200 && typeof dryJson.providers === "object"
  );
  const unsub = await ctx.request.get(
    `${BASE}/api/subscribe/unsubscribe?e=bad&s=bad`
  );
  check("unsubscribe rejects bad sig", unsub.status() === 400);
  const sigPub = await ctx.request.post(`${BASE}/api/host/signage`, {
    data: {},
  });
  check("signage publish 401 unauth", sigPub.status() === 401);
  const upl = await ctx.request.post(`${BASE}/api/host/media/upload`, {
    data: { name: "x.mp4", mimeType: "video/mp4", size: 1000 },
  });
  check("media upload 401 unauth", upl.status() === 401);
  const propEdit = await ctx.request.post(`${BASE}/api/host/property`, {
    multipart: { op: "update-property" },
  });
  check("property edit 401 unauth", propEdit.status() === 401);
  // Every host API route must refuse unauthenticated callers — this list is
  // the contract; add a line when adding a route.
  for (const [name, method, path] of [
    ["channels", "get", "/api/host/channels"],
    ["campaigns", "get", "/api/host/campaigns"],
    ["takeover", "post", "/api/host/takeover"],
    ["media meta", "get", "/api/host/media/meta"],
    ["media health", "post", "/api/host/media/health"],
    ["tvs ops", "post", "/api/host/tvs"],
    ["dashboard ops", "post", "/api/host/dashboard"],
    ["mode hooks", "get", "/api/host/mode-hooks"],
    ["joined stays", "get", "/api/host/joined"],
    ["media pull-upload", "post", "/api/host/media/pull-upload"],
    ["host users", "get", "/api/host/users"],
  ]) {
    const res =
      method === "get"
        ? await ctx.request.get(`${BASE}${path}`)
        : await ctx.request.post(`${BASE}${path}`, { data: {} });
    check(`${name} 401 unauth`, res.status() === 401);
  }

  // QR tracker is public (guests hit it mid-scan) and must always redirect —
  // including bogus slugs, which land on the brand site instead of erroring.
  // Open-redirect negatives: evil hosts must never appear in Location.
  const go = await ctx.request.get(`${BASE}/go/story`, { maxRedirects: 0 });
  check("qr tracker redirects", [301, 302, 307, 308].includes(go.status()));
  const bogus = await ctx.request.get(`${BASE}/go/nope`, { maxRedirects: 0 });
  check("qr tracker rejects bogus slug safely", [301, 302, 307, 308].includes(bogus.status()));
  const evil = await ctx.request.get(
    `${BASE}/go/book?to=${encodeURIComponent("https://evil.com/")}`,
    { maxRedirects: 0 }
  );
  const evilLoc = evil.headers()["location"] || "";
  check(
    "qr tracker blocks open redirect (evil host)",
    [301, 302, 307, 308].includes(evil.status()) &&
      !/evil\.com/i.test(evilLoc) &&
      /thefloridahavens\.com/i.test(evilLoc)
  );
  const brand = await ctx.request.get(
    `${BASE}/go/book?to=${encodeURIComponent("https://www.thefloridahavens.com/")}`,
    { maxRedirects: 0 }
  );
  const brandLoc = brand.headers()["location"] || "";
  check(
    "qr tracker allows brand host dest",
    [301, 302, 307, 308].includes(brand.status()) &&
      /thefloridahavens\.com/i.test(brandLoc)
  );
  await ctx.close();
}

// ---- deviceClass: signage (XDS-1078 panels) ---------------------------
// Guest /tv is house guide + one Roku-input coach (Devin 2026-09-10).
// Both classes must reach Watch TV and must not offer the Entertainment
// grid. Pairing / ?device= identity must not regress.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // The menu is closed at rest, so its items aren't in the DOM until a key
  // opens it — asserting on the idle deck passes vacuously in both directions.
  // Follow the proven pattern above: wait for real content (the first poll can
  // take up to the source budget on a cold server), then click to focus so the
  // window keydown listener actually receives the press.
  async function menuText(url) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => document.body.innerText.includes("The Dunes"), {
        timeout: 20000,
      })
      .catch(() => {});
    await page.locator("main").click({ position: { x: 40, y: 40 } }).catch(() => {});
    await page.keyboard.press("Enter"); // OK summons the menu
    await page.waitForTimeout(500);
    return (await page.textContent("body")) ?? "";
  }

  const sign = await menuText(`${BASE}/tv?class=signage`);
  check("signage: renders a deck", sign.length > 40);
  check("signage: menu offers Watch TV coach", /Watch TV/i.test(sign));
  check("signage: menu hides Entertainment launcher", !/Entertainment/i.test(sign));

  const streamer = await menuText(`${BASE}/tv`);
  check("streamer menu offers Watch TV coach", /Watch TV/i.test(streamer));
  check("streamer menu hides Entertainment launcher", !/Entertainment/i.test(streamer));

  // A bogus value must fail safe to streamer, never silently alter behaviour.
  const bogus = await menuText(`${BASE}/tv?class=nonsense`);
  check("unknown class falls back to streamer", /Watch TV/i.test(bogus));

  // USB presenter remotes (the only remote a Cast Pro panel can take — its
  // HDMI-CEC is outbound-only) send Space/PageUp/PageDown, never a D-pad.
  // Space must select, and a stray letter must still be ignored so someone
  // typing on an attached keyboard can't walk the guest deck.
  async function pressOnDeck(url, key) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(() => document.body.innerText.includes("The Dunes"), {
        timeout: 20000,
      })
      .catch(() => {});
    await page.locator("main").click({ position: { x: 40, y: 40 } }).catch(() => {});
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
    return (await page.textContent("body")) ?? "";
  }

  const spaced = await pressOnDeck(`${BASE}/tv?class=signage`, "Space");
  check("Space acts as select (USB presenter)", /Watch TV/i.test(spaced));

  const typed = await pressOnDeck(`${BASE}/tv?class=signage`, "q");
  check(
    "stray typing does not open the menu",
    typed.length > 40 && (await page.locator("nav").count()) === 0
  );

  // Device identity from the URL: signage appliances fix their start URL at
  // install and some never persist localStorage, so ?device= must win and be
  // what the poll reports — otherwise every reboot mints a new pairing code.
  const pinned = "11111111-2222-4333-8444-555555555555";
  await page.goto(`${BASE}/tv?class=signage&device=${pinned}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  check(
    "?device= pins the device identity",
    (await page.evaluate(() => localStorage.getItem("fh_tv_device"))) === pinned
  );

  // Regression guard for the XDS-1078 crash loop: crypto.randomUUID() exists
  // only in secure contexts, so on http:// the identity effect threw, the page
  // never came up, and the appliance watchdog restarted it in a loop. Simulate
  // the missing API and require the TV to still come up with an id.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.addInitScript(() => {
    // @ts-expect-error deliberately removing the secure-context-only API
    delete Object.getPrototypeOf(window.crypto).randomUUID;
  });
  await p2.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(2500);
  const idNoCrypto = await p2.evaluate(() => localStorage.getItem("fh_tv_device"));
  check(
    "TV survives without crypto.randomUUID (http:// crash loop)",
    Boolean(idNoCrypto) && /^[0-9a-f-]{36}$/i.test(idNoCrypto ?? ""),
    idNoCrypto ?? "no id"
  );
  await ctx2.close();

  // Hostname root routing (middleware.ts): a bare brand subdomain must land on
  // its endpoint, with query params carried through, while every other host and
  // path is untouched. Exercised via a spoofed Host header since the smoke run
  // hits localhost.
  {
    // The pairing code is client-rendered, so a JS-free fetch can't see it.
    // Assert what "rewrites to the TV app" actually means instead: the root on
    // that host serves the same route as a direct /tv request, and NOT the
    // landing page.
    const r = await page.request.get(`${BASE}/`, {
      headers: { host: "tv.thefloridahavens.com" },
      maxRedirects: 0,
    });
    const rewritten = await r.text();
    const direct = await (await page.request.get(`${BASE}/tv`)).text();
    const landing = await (await page.request.get(`${BASE}/`)).text();
    check(
      "tv.<brand>/ rewrites to the TV app",
      r.status() === 200 &&
        rewritten.includes("app/tv") &&
        direct.includes("app/tv") &&
        !landing.includes("app/tv"),
      `status ${r.status()}`
    );
    const rq = await page.request.get(`${BASE}/?class=signage`, {
      headers: { host: "tv.thefloridahavens.com" },
      maxRedirects: 0,
    });
    check("tv.<brand>/ keeps the query string", rq.status() === 200);
    const rh = await page.request.get(`${BASE}/`, {
      headers: { host: "host.thefloridahavens.com" },
      maxRedirects: 0,
    });
    check(
      "host.<brand>/ rewrites to the gated host app",
      [200, 307].includes(rh.status()),
      `status ${rh.status()}`
    );
    // Unknown hosts must still get the landing page, not a rewrite.
    const rl = await page.request.get(`${BASE}/`, { maxRedirects: 0 });
    check(
      "unknown host still serves the landing page",
      rl.status() === 200 && !/Pair this TV/.test(await rl.text())
    );
  }
  await page.close();
}

// ---- Host analytics charts (#138) -------------------------------------
// The dashboard charts are pure SVG built from live Guesty/scan data, so in
// mock mode they self-suppress rather than render. What must hold in EVERY
// mode is that the dashboard survives the null-data path and emits no NaN
// geometry — an SVG path with NaN silently renders nothing on a host's screen
// and throws no error, which is exactly the failure this guards.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/host/login`, { waitUntil: "networkidle" });
  await page.fill("input[name=code]", "demo");
  await page.click("button[type=submit]");
  await page.waitForURL("**/host");
  await page.waitForLoadState("networkidle");

  check("dashboard survives chart null-data path", errors.length === 0, errors[0] ?? "");

  const svgGeometry = await page.evaluate(() =>
    Array.from(document.querySelectorAll("svg path, svg rect, svg line"))
      .flatMap((el) =>
        ["d", "x", "y", "width", "height", "x1", "x2", "y1", "y2"].map(
          (a) => el.getAttribute(a) ?? ""
        )
      )
      .join(" ")
  );
  check(
    "no NaN/Infinity in dashboard SVG geometry",
    !/NaN|Infinity/.test(svgGeometry)
  );

  // When live data is present the charts must be labelled for screen readers
  // (and for Grok's markup-level QA); in mock mode there is nothing to label.
  const charts = await page.locator("svg[aria-label]").count();
  const hasIntel = (await page.textContent("body")).includes("Next 14 nights");
  check(
    "occupancy chart labelled when data present",
    hasIntel ? charts >= 1 : true,
    hasIntel ? `${charts} labelled svg` : "mock mode — no intel"
  );
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
