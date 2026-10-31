/**
 * F-3321 — surviving mutant killers (offline sweep, rate limit, forget, load allowlist).
 */
import "./lib/tv-report-route-register.mjs";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARENT_UPPER = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const ORPHAN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const { NextRequest } = await import("next/server.js");
const { GET: offlineAlertsGet } = await import(
  "../app/api/tv/offline-alerts/route.ts"
);
const {
  isDeviceReportRateLimited,
  sanitizeDeviceReportsMap,
  deviceReportConfigKey,
} = await import("../lib/tv-device-report-store.ts");
const { forgetTvDevice } = await import("../lib/tv.ts");
const { alertHeartbeatIso } = await import("../lib/offline-alert-policy.ts");

function eqParam(u, name) {
  const raw = u.searchParams.get(name);
  if (!raw?.startsWith("eq.")) return raw;
  return decodeURIComponent(raw.slice(3));
}

{
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "fleet-cron-secret";
  for (const code of ["demo", "FH2026hosts", "Stay0s-Field-9k"]) {
    const res = await offlineAlertsGet(
      new NextRequest("http://localhost/api/tv/offline-alerts", {
        headers: { "x-alerts-key": code },
      })
    );
    check(`F-3321 cron rejects host code ${code}`, res.status === 401);
  }
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
}

{
  const prevUpdatedAt = "2026-10-28T12:00:00.000Z";
  const receivedAt = "2026-10-28T12:00:05.000Z";
  check(
    "F-3321 rate limit numeric within 15s literal true",
    isDeviceReportRateLimited(prevUpdatedAt, receivedAt) === true
  );
  const lexPrev = "2026-10-28T09:00:00.000Z";
  const lexRecv = "2026-10-28T12:00:05.000Z";
  check(
    "F-3321 rate limit numeric gap >15s literal false",
    isDeviceReportRateLimited(lexPrev, lexRecv) === false
  );
  check(
    "F-3321 string compare would wrongly limit long gap",
    String(lexRecv) < String(lexPrev) === false
  );
}

{
  const allowed = new Set([PARENT]);
  const map = sanitizeDeviceReportsMap(
    [
      {
        key: deviceReportConfigKey(PARENT),
        value: JSON.stringify({
          receivedAt: "2026-10-28T12:00:00.000Z",
          auth: "legacy",
          report: {
            deviceId: PARENT,
            mode: "attract",
            foreground: "signage",
            errors: [],
          },
        }),
      },
      {
        key: deviceReportConfigKey(ORPHAN),
        value: JSON.stringify({
          receivedAt: "2026-10-28T12:00:00.000Z",
          auth: "legacy",
          report: {
            deviceId: ORPHAN,
            mode: "attract",
            foreground: "signage",
            errors: [],
          },
        }),
      },
    ],
    allowed
  );
  check("F-3321 allowlist keeps fleet device only", Object.keys(map).length === 1);
  check("F-3321 allowlist drops orphan key literal", map[PARENT] !== undefined && map[ORPHAN] === undefined);
}

{
  let deletedKey = "";
  const fetch = async (input, init) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "DELETE" && url.includes("/app_config")) {
      const u = new URL(url);
      deletedKey = eqParam(u, "key");
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if ((init?.method ?? "GET") === "DELETE" && url.includes("/tv_devices")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = fetch;
  await forgetTvDevice(PARENT_UPPER);
  check(
    "F-3321 forget deletes canonical lowercase key literal",
    deletedKey === deviceReportConfigKey(PARENT)
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

{
  const staleLastSeen = "2026-10-28T10:00:00.000Z";
  const spoofReceived = "2026-10-28T11:59:30.000Z";
  const nowMs = Date.parse("2026-10-28T12:00:00.000Z");
  const legacySpoof = {
    receivedAt: spoofReceived,
    auth: "legacy",
    report: {
      deviceId: PARENT,
      reportedType: "web_tv",
      mode: "attract",
      foreground: "streaming",
      errors: [],
    },
  };
  check(
    "F-3321 M3 cron legacy heartbeat literal last_seen",
    alertHeartbeatIso(legacySpoof, staleLastSeen, nowMs) === staleLastSeen
  );
  check(
    "F-3321 M4 legacy heartbeat not spoof receivedAt literal",
    alertHeartbeatIso(legacySpoof, staleLastSeen, nowMs) !== spoofReceived
  );
}

{
  const prevResend = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_configured_mailer";
  const prevHost = process.env.HOST_ALERT_EMAILS;
  process.env.HOST_ALERT_EMAILS = "ops@thefloridahavens.com";
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/tv_devices")) {
      return new Response(
        JSON.stringify([
          {
            id: PARENT,
            label: "Living",
            pair_code: "ABCD",
            property_id: PROP,
            last_seen: "2026-10-28T10:00:00.000Z",
            properties: { name: "Test" },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (method === "GET" && url.includes("/tv_offline_alerts")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "GET" && url.includes("/app_config")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && url.includes("/tv_offline_alerts")) {
      return new Response(JSON.stringify([{}]), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const { runTvOfflineAlerts } = await import("../lib/tv-offline-alerts.ts");
  const summary = await runTvOfflineAlerts(false, Date.parse("2026-10-28T12:00:00.000Z"));
  check("F-3321 email configured literal true", summary.emailConfigured === true);
  check("F-3321 flag off literal false", summary.emailsEnabled === false);
  check("F-3321 send gate literal zero sent", summary.sent === 0);
  check("F-3321 send gate literal skipped not sent", summary.skipped === 1);

  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  if (prevResend === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prevResend;
  if (prevHost === undefined) delete process.env.HOST_ALERT_EMAILS;
  else process.env.HOST_ALERT_EMAILS = prevHost;
}

process.exit(failed);
