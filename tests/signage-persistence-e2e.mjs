/**
 * Signage analytics persistence e2e (throwaway postgres:16 + PostgREST only).
 */
import { spawnSync } from "node:child_process";

const E2E_REST = process.env.SIGNAGE_E2E_REST_URL ?? "http://127.0.0.1:54322";
const E2E_SUPABASE_PROXY =
  process.env.SIGNAGE_E2E_SUPABASE_URL ?? "http://127.0.0.1:54323";
const APP_BASE = process.env.SIGNAGE_E2E_APP_URL ?? "http://127.0.0.1:3100";

const serviceJwt =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  spawnSync(
    "node",
    ["tests/signage-e2e/mint-jwt.mjs", "service_role"],
    { encoding: "utf8" }
  ).stdout.trim();

const anonJwt = spawnSync("node", ["tests/signage-e2e/mint-jwt.mjs", "anon"], {
  encoding: "utf8",
}).stdout.trim();

if (!serviceJwt) {
  console.error("FAIL  could not mint service_role JWT");
  process.exit(1);
}

process.env.NEXT_PUBLIC_SUPABASE_URL = E2E_SUPABASE_PROXY;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceJwt;
process.env.QR_VISITOR_HASH_SALT =
  process.env.QR_VISITOR_HASH_SALT ?? "signage-e2e-visitor-salt";

const DEVICE = "22222222-2222-4222-8222-222222222222";
const TAG = "e2etvtag0001";
const PROPERTY = "turtle-haven";
const SLIDE = "guestbook";
const SLUG = "book";

const { loadSignageInsights } = await import("../lib/signage-analytics.ts");

async function probeRest() {
  const r = await fetch(`${E2E_REST}/qr_scan_events?select=id&limit=1`, {
    headers: { apikey: serviceJwt, Authorization: `Bearer ${serviceJwt}` },
  });
  return r.ok;
}

async function probeAnonDenied() {
  const r = await fetch(`${E2E_REST}/qr_scan_events?select=id&limit=1`, {
    headers: { apikey: anonJwt, Authorization: `Bearer ${anonJwt}` },
  });
  return r.status === 401 || r.status === 403 || r.status === 406;
}

async function probeApp() {
  const r = await fetch(`${APP_BASE}/tv`, { redirect: "manual" });
  return r.status === 200;
}

const goRes = await fetch(
  `${APP_BASE}/go/${SLUG}?property=${PROPERTY}&tag=${TAG}&slide=${SLIDE}`,
  { redirect: "manual", headers: { "user-agent": "signage-e2e/1.0" } }
);

const impRes = await fetch(`${APP_BASE}/api/tv/impressions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    deviceId: DEVICE,
    rows: [{ slideId: SLIDE, showCount: 3, secondsOnScreen: 42 }],
  }),
});

const fbRes = await fetch(`${APP_BASE}/api/feedback`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    property: PROPERTY,
    tag: TAG,
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
    `${E2E_REST}/qr_scan_events?select=slug,property_slug,attribution_tag,visitor_key,tv_device_id,slide_id&property_slug=eq.turtle-haven&limit=5`,
    {
      headers: {
        apikey: serviceJwt,
        Authorization: `Bearer ${serviceJwt}`,
      },
    }
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
      }
    : null,
  anonProbeStatus: await probeAnonDenied(),
};

let failed = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = 1;
}

check("throwaway PostgREST reachable (service role)", await probeRest());
check("anon JWT denied on qr_scan_events (RLS+REVOKE)", await probeAnonDenied());
check("Next app reachable", await probeApp());
check("QR /go records (302)", goRes.status === 302);
const scanHit = scanRows?.[0];
check(
  "scan row stores attribution tag",
  scanHit?.attribution_tag === TAG && scanHit?.tv_device_id === DEVICE
);
check(
  "visitor_key stored hashed (64 hex)",
  typeof scanHit?.visitor_key === "string" &&
    /^[a-f0-9]{64}$/.test(scanHit.visitor_key)
);
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