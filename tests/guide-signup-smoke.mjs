/**
 * Guide signup + Mailchimp mock (no live Mailchimp).
 * Run: node tests/guide-signup-smoke.mjs (server must be up — npm run dev or smoke harness).
 */
import { createServer } from "http";
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3000";
const EXEC =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/usr/bin/chromium";

let mailchimpCalls = 0;
let mailchimpBody = null;

function check(name, ok) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${name}`);
  }
}

// Stub Mailchimp for the dev server process — only works if we call API directly.
// This file tests /api/guide-signup via fetch without needing global mock.

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const bad = await apiPost("/api/guide-signup", { email: "nope" });
  check("guide-signup rejects invalid email", bad.status === 400);

  const hp = await apiPost("/api/guide-signup", {
    email: "guest@example.com",
    company: "bot inc",
    consentMarketing: true,
  });
  check("honeypot returns ok silently", hp.status === 200 && hp.json.ok === true);

  const noMkt = await apiPost("/api/guide-signup", {
    email: `tx-${Date.now()}@example.com`,
    property: "The Dunes",
    consentMarketing: false,
  });
  check("transactional signup ok", noMkt.status === 200 && noMkt.json.ok === true);
  check("no mailchimp when marketing false", noMkt.json.mailchimpPending !== true);

  const mkt = await apiPost("/api/guide-signup", {
    email: `mkt-${Date.now()}@example.com`,
    property: "The Dunes",
    consentMarketing: true,
  });
  check("marketing signup ok", mkt.status === 200 && mkt.json.ok === true);

  const priv = await fetch(`${BASE}/privacy`);
  check("privacy page 200", priv.status === 200);
  const privHtml = await priv.text();
  check("privacy mentions Mailchimp", /Mailchimp/i.test(privHtml));

  const browser = await chromium.launch({
    executablePath: EXEC,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/welcome?token=demo`, { waitUntil: "networkidle" });
  check(
    "portal guide email block",
    (await page.locator("[data-guide-email-signup]").count()) >= 1
  );
  check(
    "portal privacy link",
    (await page.locator('a[href="/privacy"]').count()) >= 1
  );
  const boxes = await page.locator('[data-guide-email-signup] input[type="checkbox"]').count();
  check("guide consent checkbox present", boxes >= 1);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});