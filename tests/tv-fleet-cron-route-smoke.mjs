/**
 * F-3270 — offline cron route + fleet policy literals (route-level where applicable).
 */
import "./lib/tv-report-route-register.mjs";
import { createClient } from "@supabase/supabase-js";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REPORT_KEY = `device_report:${PARENT}`;

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const { verifyCronBearer } = await import("../lib/cron-auth.ts");
const { NextRequest } = await import("next/server.js");
const { GET: offlineAlertsGet } = await import(
  "../app/api/tv/offline-alerts/route.ts"
);
const {
  alertHeartbeatIso,
  shouldSuppressNewOfflineIncident,
  isDeviceStaleForAlerts,
} = await import("../lib/offline-alert-policy.ts");
const { getOfflineAlertEmailsEnabled } = await import("../lib/tv-offline-alerts.ts");
const { forgetTvDevice } = await import("../lib/tv.ts");
const { resetRateLimitsForTests } = await import("../lib/in-memory-rate-limit.ts");
const { POST } = await import("../app/api/tv/report/route.ts");

const POLICY_NOW = Date.parse("2026-10-28T12:00:00.000Z");
const LEGACY_LAST_SEEN = "2026-10-28T11:00:00.000Z";
const LEGACY_FRESH_RECEIVED = "2026-10-28T11:59:30.000Z";

{
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const unsetReq = new NextRequest("http://localhost/api/tv/offline-alerts", {
    headers: { authorization: "Bearer any-secret" },
  });
  const unsetRes = await offlineAlertsGet(unsetReq);
  check("F-3270 cron route fails closed unset CRON_SECRET", unsetRes.status === 401);

  process.env.CRON_SECRET = "fleet-cron-secret";
  const hostCodeReq = new NextRequest("http://localhost/api/tv/offline-alerts", {
    headers: { "x-alerts-key": "demo" },
  });
  const hostCodeRes = await offlineAlertsGet(hostCodeReq);
  check("F-3270 cron route rejects host access code header", hostCodeRes.status === 401);

  const badBearer = await offlineAlertsGet(
    new NextRequest("http://localhost/api/tv/offline-alerts", {
      headers: { authorization: "Bearer fleet-cron-secret-wrong" },
    })
  );
  check("F-3270 cron route rejects wrong bearer", badBearer.status === 401);

  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
}

{
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const emailsOn = await getOfflineAlertEmailsEnabled();
  check("F-3270 offline_alert_emails_enabled default OFF", emailsOn === false);
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

{
  const legacyFreshStreaming = {
    receivedAt: LEGACY_FRESH_RECEIVED,
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
    "F-3270 legacy streaming suppress literal false",
    shouldSuppressNewOfflineIncident(legacyFreshStreaming, POLICY_NOW) === false
  );
  check(
    "F-3270 legacy heartbeat literal last_seen",
    alertHeartbeatIso(legacyFreshStreaming, LEGACY_LAST_SEEN, POLICY_NOW) ===
      LEGACY_LAST_SEEN
  );
  check(
    "F-3270 legacy still stale at 15m literal true",
    isDeviceStaleForAlerts(LEGACY_LAST_SEEN, 15, POLICY_NOW) === true
  );

  const tokenFreshStreaming = {
    receivedAt: LEGACY_FRESH_RECEIVED,
    auth: "token",
    report: {
      deviceId: PARENT,
      reportedType: "web_tv",
      mode: "attract",
      foreground: "streaming",
      errors: [],
    },
  };
  check(
    "F-3270 token fresh streaming suppress literal true",
    shouldSuppressNewOfflineIncident(tokenFreshStreaming, POLICY_NOW) === true
  );
  check(
    "F-3270 token heartbeat literal receivedAt",
    alertHeartbeatIso(tokenFreshStreaming, LEGACY_LAST_SEEN, POLICY_NOW) ===
      LEGACY_FRESH_RECEIVED
  );
}

{
  let insertStatus = "";
  const staleLastSeen = "2026-10-28T10:00:00.000Z";
  const fetch = async (input, init) => {
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
            last_seen: staleLastSeen,
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
      insertStatus = JSON.parse(String(init.body)).status;
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
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = fetch;
  const { runTvOfflineAlerts } = await import("../lib/tv-offline-alerts.ts");
  const summary = await runTvOfflineAlerts(false, POLICY_NOW);
  check("F-3270 send gate emailsEnabled literal false", summary.emailsEnabled === false);
  check(
    "F-3270 incident status literal skipped:emails-disabled",
    insertStatus === "skipped:emails-disabled"
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

function eqParam(u, name) {
  const raw = u.searchParams.get(name);
  if (!raw?.startsWith("eq.")) return raw;
  return decodeURIComponent(raw.slice(3));
}

{
  resetRateLimitsForTests();
  const logs = [];
  const prevLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  let tvReads = 0;
  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/tv_devices")) {
      tvReads += 1;
      const u = new URL(url);
      const id = eqParam(u, "id");
      return new Response(
        JSON.stringify([{ id, property_id: PROP }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (method === "GET" && url.includes("/app_config")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST" && url.includes("/app_config")) {
      return new Response(JSON.stringify([{ key: "x" }]), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = fetch;
  await POST(
    new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: PARENT,
        type: "roku",
        mode: "attract",
        foreground: "signage",
        errors: [],
      }),
    })
  );
  await POST(
    new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "not-a-uuid", type: "roku", mode: "x", foreground: "signage" }),
    })
  );
  console.log = prevLog;
  const joined = logs.join("\n");
  check(
    "F-3270 log deviceId literal valid uuid",
    joined.includes(`"deviceId":"${PARENT}"`)
  );
  check(
    "F-3270 log deviceId literal invalid",
    joined.includes('"deviceId":"invalid"')
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

{
  const config = new Map([[REPORT_KEY, { value: "{}" }]]);
  let deletedKey = "";
  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "DELETE" && url.includes("/app_config")) {
      const u = new URL(url);
      deletedKey = eqParam(u, "key");
      config.delete(deletedKey);
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (method === "DELETE" && url.includes("/tv_devices")) {
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
  await forgetTvDevice(PARENT);
  check(
    "F-3270 forget deletes literal device_report key",
    deletedKey === REPORT_KEY && !config.has(REPORT_KEY)
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

process.exit(failed);
