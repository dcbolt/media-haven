/**
 * Signage analytics persistence e2e (throwaway postgres:16 + PostgREST only).
 *
 * Prereq:
 *   docker compose -f tests/signage-e2e/docker-compose.yml up -d
 *   PORT=3100 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54322 \
 *     SUPABASE_SERVICE_ROLE_KEY=e2e-local npm start
 *
 * Does not touch production Supabase or apply migrations there.
 */
const E2E_REST = process.env.SIGNAGE_E2E_REST_URL ?? "http://127.0.0.1:54322";
const E2E_SUPABASE_PROXY =
  process.env.SIGNAGE_E2E_SUPABASE_URL ?? "http://127.0.0.1:54323";
const APP_BASE = process.env.SIGNAGE_E2E_APP_URL ?? "http://127.0.0.1:3100";

process.env.NEXT_PUBLIC_SUPABASE_URL = E2E_SUPABASE_PROXY;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const DEVICE = "22222222-2222-4222-8222-222222222222";
const PROPERTY = "turtle-haven";
const SLIDE = "guestbook";
const SLUG = "book";

const { loadSignageInsights } = await import("../lib/signage-analytics.ts");

async function probeRest() {
  const r = await fetch(`${E2E_REST}/qr_scan_events?select=id&limit=1`);
  return r.ok;
}

async function probeApp() {
  const r = await fetch(`${APP_BASE}/tv`, { redirect: "manual" });
  return r.status === 200;
}

const goRes = await fetch(
  `${APP_BASE}/go/${SLUG}?property=${PROPERTY}&tv=${DEVICE}&slide=${SLIDE}`,
  { redirect: "manual", headers: { "user-agent": "signage-e2e/1.0" } }
);

const impRes = await fetch(`${APP_BASE}/api/tv/impressions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    deviceId: DEVICE,
    propertySlug: PROPERTY,
    isTest: false,
    rows: [{ slideId: SLIDE, showCount: 3, secondsOnScreen: 42 }],
  }),
});

const fbRes = await fetch(`${APP_BASE}/api/feedback`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    property: PROPERTY,
    tv: DEVICE,
    slide: SLIDE,
    rating: 5,
    comment: "e2e signage persistence probe",
  }),
});
const fbJson = await fbRes.json().catch(() => ({}));

await new Promise((r) => setTimeout(r, 1500));

const insights = await loadSignageInsights(7);
const row = (insights ?? []).find(
  (r) =>
    r.slideId === SLIDE &&
    r.propertySlug === PROPERTY &&
    r.tvDeviceId === DEVICE
);

const scanRows = await (
  await fetch(
    `${E2E_REST}/qr_scan_events?select=slug,property_slug,tv_device_id,slide_id&property_slug=eq.turtle-haven&limit=5`
  )
).json();

const snapshot = {
  restUrl: E2E_REST,
  appUrl: APP_BASE,
  goRedirectStatus: goRes.status,
  impressionsHttp: impRes.status,
  feedbackHttp: fbRes.status,
  feedbackBody: fbJson,
  scanRows,
  insightsRow: row
    ? {
        slideId: row.slideId,
        propertySlug: row.propertySlug,
        tvDeviceId: row.tvDeviceId,
        impressions: row.impressions,
        secondsOnScreen: row.secondsOnScreen,
        scans: row.scans,
        ratingCount: row.ratingCount,
        ratingAvg: row.ratingAvg,
        latestComments: row.latestComments?.slice(0, 1),
      }
    : null,
};

let failed = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = 1;
}

check("throwaway PostgREST reachable", await probeRest());
check("Next app reachable", await probeApp());
check("QR /go records (302)", goRes.status === 302);
check("impressions POST ok", impRes.status === 200);
check("feedback POST ok", fbRes.status === 200 && fbJson.ok === true);
check(
  "insights merged scan + impression + feedback",
  Boolean(row) &&
    row.impressions >= 3 &&
    row.secondsOnScreen >= 42 &&
    row.scans >= 1 &&
    row.ratingCount >= 1,
  row ? JSON.stringify(row) : "no row"
);

console.log("\n--- signage persistence e2e snapshot ---");
console.log(JSON.stringify(snapshot, null, 2));

process.exit(failed);