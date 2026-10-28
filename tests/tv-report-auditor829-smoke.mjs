/**
 * F-3265 / F-3266 / F-3267 — reject budget ordering, mutant killers, cron whitespace.
 */
import "./lib/tv-report-route-register.mjs";
import { createClient } from "@supabase/supabase-js";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNKNOWN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

function eqParam(u, name) {
  const raw = u.searchParams.get(name);
  if (!raw?.startsWith("eq.")) return raw;
  return decodeURIComponent(raw.slice(3));
}

function makeSupabaseMock(options = {}) {
  const config = new Map();
  const devices = new Map(options.devices ?? [[PARENT, { property_id: PROP }]]);
  let tvDeviceReads = 0;

  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url.includes("/tv_devices")) {
      tvDeviceReads += 1;
      const u = new URL(url);
      const id = eqParam(u, "id");
      const row = devices.get(id);
      return json(row ? [{ id, property_id: row.property_id }] : []);
    }
    if (method === "PATCH" && url.includes("/tv_devices")) {
      return json([{}]);
    }
    if (method === "GET" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      if (keyEq) {
        if (options.failConfigRead) {
          return json({ message: "leak", code: "PGRST000" }, 500);
        }
        const row = config.get(keyEq);
        return json(
          row ? [{ key: keyEq, updated_at: row.updated_at, value: row.value }] : []
        );
      }
      return json([]);
    }
    if (method === "POST" && url.includes("/app_config")) {
      const body = JSON.parse(String(init.body));
      if (config.has(body.key)) return json(null, 409, { code: "23505" });
      config.set(body.key, {
        value: body.value,
        updated_at: body.updated_at ?? new Date().toISOString(),
      });
      return json([{ key: body.key }], 201);
    }
    if (method === "PATCH" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      const updatedEq = eqParam(u, "updated_at");
      const hasUpdatedAtEq = url.includes("updated_at=eq.");
      const cur = config.get(keyEq);
      if (hasUpdatedAtEq && (!cur || cur.updated_at !== updatedEq)) {
        return json([]);
      }
      const body = JSON.parse(String(init.body));
      config.set(keyEq, { value: body.value, updated_at: body.updated_at });
      return json([{ key: keyEq }]);
    }
    return json([]);
  };

  function json(data, status = 200, errBody = null) {
    if (status >= 400) {
      return new Response(JSON.stringify(data ?? errBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    if (status === 409) {
      return new Response(JSON.stringify(errBody), { status: 409 });
    }
    return new Response(JSON.stringify(data ?? []), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  const db = createClient("https://example.supabase.co", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return { fetch, getTvDeviceReads: () => tvDeviceReads, config, db };
}

async function withRouteEnv(mockFetch, fn) {
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = mockFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
}

const { resetRateLimitsForTests } = await import("../lib/in-memory-rate-limit.ts");
const {
  consumeReportRejectBudget,
  isReportRejectBudgetExhausted,
} = await import("../lib/tv-report-reject-limit.ts");
const { NextRequest } = await import("next/server.js");
const { POST } = await import("../app/api/tv/report/route.ts");
const { verifyCronBearer } = await import("../lib/cron-auth.ts");
const { GET: offlineAlertsGet } = await import(
  "../app/api/tv/offline-alerts/route.ts"
);
const { parseDeviceReportPayload } = await import("../lib/tv-device-report-parse.ts");
const { sanitizeDeviceReportsMap } = await import("../lib/tv-device-report-store.ts");
const { isDeviceReportRateLimited } = await import("../lib/tv-device-report-store.ts");
const { MAX_DEVICE_REPORT_LOAD } = await import("../lib/tv-device-report-store.ts");
const { getOfflineAlertEmailsEnabled } = await import("../lib/tv-offline-alerts.ts");
const { forgetTvDevice } = await import("../lib/tv.ts");

const payload = {
  deviceId: PARENT,
  type: "roku",
  mode: "attract",
  foreground: "signage",
  errors: [],
};

{
  resetRateLimitsForTests();
  const fixedNow = 1_700_000_000_000;
  for (let i = 0; i < 60; i += 1) {
    consumeReportRejectBudget("203.0.113.1", fixedNow);
  }
  check(
    "M14 per-IP budget exhausted blocks next consume",
    !consumeReportRejectBudget("203.0.113.1", fixedNow).ok
  );
  check(
    "M14 other IP still has budget",
    consumeReportRejectBudget("203.0.113.2", fixedNow).ok
  );
}

{
  resetRateLimitsForTests();
  const fixedNow = 1_700_000_000_000;
  for (let i = 0; i < 400; i += 1) {
    consumeReportRejectBudget(`198.51.100.${i % 250}`, fixedNow);
  }
  check(
    "M15 global budget exhausted",
    !consumeReportRejectBudget("203.0.113.50", fixedNow).ok
  );
}

{
  resetRateLimitsForTests();
  const fixedNow = 1_700_000_000_000;
  for (let i = 0; i < 60; i += 1) {
    consumeReportRejectBudget("203.0.113.77", fixedNow);
  }
  const peek = isReportRejectBudgetExhausted("203.0.113.77", fixedNow);
  check("M23 peek matches exhausted per-IP", peek.exhausted === true);
}

{
  resetRateLimitsForTests();
  const ip = "203.0.113.200";
  const { fetch, getTvDeviceReads } = makeSupabaseMock({ failConfigRead: true });
  await withRouteEnv(fetch, async () => {
    for (let i = 0; i < 60; i += 1) {
      await POST(
        new NextRequest("http://localhost/api/tv/report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify(payload),
        })
      );
    }
    const readsBefore = getTvDeviceReads();
    const res = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ ...payload, deviceId: UNKNOWN }),
      })
    );
    check("F-3265 budget spent returns 429", res.status === 429);
    check(
      "F-3265 unknown uuid zero tv_devices reads when capped",
      getTvDeviceReads() === readsBefore
    );
  });
}

{
  resetRateLimitsForTests();
  const logs = [];
  const prevLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  const secretBody = "SECRET_FOREGROUND_LEAK_3266";
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        foreground: secretBody,
        errors: [{ at: "", code: "x", msg: secretBody }],
      }),
    });
    await POST(req);
  });
  console.log = prevLog;
  const joined = logs.join("\n");
  check("M9 logs omit request foreground", !joined.includes(secretBody));
  check("M9 logs omit errors payload", !joined.includes("SECRET_FOREGROUND"));
}

{
  resetRateLimitsForTests();
  const { fetch, config } = makeSupabaseMock();
  const childId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        children: [{ deviceId: childId, type: "roku", mode: "attract", foreground: "signage" }],
      }),
    });
    const res = await POST(req);
    check("M7 children POST still 200", res.status === 200);
    const keys = [...config.keys()];
    check("M7 only parent device_report key", keys.length === 1 && keys[0].includes(PARENT));
    check("M7 stored JSON has no children", !config.get(keys[0]).value.includes("children"));
  });
}

{
  const parsed = parseDeviceReportPayload({
    deviceId: PARENT,
    type: 12345,
    mode: "attract",
    foreground: "signage",
  });
  check(
    "M10 non-string type coerces to unknown",
    parsed.ok && parsed.report.reportedType === "unknown"
  );
}

{
  const services = Object.fromEntries(
    Array.from({ length: 90 }, (_, i) => [
      `svc_${String(i).padStart(2, "0")}_${"n".repeat(40)}`,
      "up",
    ])
  );
  const hugePayload = {
    deviceId: PARENT,
    type: "node",
    mode: "attract",
    foreground: "signage",
    errors: Array.from({ length: 5 }, () => ({
      at: "",
      code: "c".repeat(64),
      msg: "m".repeat(200),
    })),
    services,
  };
  resetRateLimitsForTests();
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(hugePayload),
    });
    const res = await POST(req);
    const body = await res.json();
    check("F-3163 over 4kb stored value returns 413 not 503", res.status === 413);
    check("F-3163 body ok false only", body.ok === false && !body.error);
  });
}

{
  resetRateLimitsForTests();
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const badJson = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const res = await POST(badJson);
    check("route reject invalid json 400", res.status === 400);
    const badId = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "nope", type: "roku", mode: "x", foreground: "signage" }),
      })
    );
    check("route reject bad deviceId 400", badId.status === 400);
  });
}

{
  const map = sanitizeDeviceReportsMap([
    {
      key: `device_report:${PARENT}`,
      value: JSON.stringify({
        receivedAt: "2026-10-28T12:00:00.000Z",
        auth: "token",
        report: {
          deviceId: PARENT,
          mode: "attract",
          foreground: "streaming",
          errors: [],
        },
      }),
    },
  ]);
  check(
    "F-3267 token auth in storage downgrades to legacy",
    map[PARENT]?.auth === "legacy"
  );
}

{
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "   ";
  check("F-3267 whitespace CRON_SECRET fails closed", !verifyCronBearer("Bearer    "));
  process.env.CRON_SECRET = "real-secret";
  check(
    "F-3267 non-empty secret accepts bearer",
    verifyCronBearer("Bearer real-secret")
  );
  const prevOffline = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-real";
  const demoReq = new NextRequest("http://localhost/api/tv/offline-alerts", {
    headers: { authorization: "Bearer demo", "x-alerts-key": "demo" },
  });
  const demoRes = await offlineAlertsGet(demoReq);
  check("M21 offline cron rejects demo bearer", demoRes.status === 401);
  if (prevOffline === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevOffline;
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
}

{
  const t0 = "2026-10-28T12:00:00.000Z";
  const tSoon = "2026-10-28T12:00:05.000Z";
  check(
    "M17 epoch-ms rate limit within window",
    isDeviceReportRateLimited(t0, tSoon)
  );
  check(
    "M17 epoch-ms allows after window",
    !isDeviceReportRateLimited(t0, "2026-10-28T12:00:20.000Z")
  );
}

{
  check("M19 bounded load constant", MAX_DEVICE_REPORT_LOAD === 500);
  const canonicalIds = [];
  for (let i = 0; i < 600; i += 1) {
    const n = (i + 1).toString(16).padStart(12, "0");
    canonicalIds.push(
      `00000000-0000-4000-8000-${n.padStart(12, "0").slice(0, 12)}`
    );
  }
  let inQueryCalls = 0;
  const fetch = async (input, init) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET" && url.includes("/app_config") && url.includes("in.")) {
      inQueryCalls += 1;
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
  const { loadDeviceReportsForDevices } = await import("../lib/tv-device-report-store.ts");
  await loadDeviceReportsForDevices(canonicalIds);
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  check("M19b load caps in-query chunks", inQueryCalls <= Math.ceil(500 / 80));
}

{
  const config = new Map();
  const devices = new Map([[PARENT, {}]]);
  let deleteReport = 0;
  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "DELETE" && url.includes("/app_config")) {
      deleteReport += 1;
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      config.delete(keyEq);
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (method === "DELETE" && url.includes("/tv_devices")) {
      devices.delete(PARENT);
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
  const key = `device_report:${PARENT}`;
  config.set(key, { value: "{}" });
  const ok = await forgetTvDevice(PARENT);
  check("M18 forgetTvDevice ok", ok === true);
  check("M18b forget deletes report row", deleteReport >= 1 && !config.has(key));
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
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
  const enabled = await getOfflineAlertEmailsEnabled();
  check("M16 offline_alert_emails_enabled default false", enabled === false);
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

{
  const staleLastSeen = "2026-10-28T10:00:00.000Z";
  const nowMs = Date.parse("2026-10-28T12:00:00.000Z");
  let insertStatus = "";
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
  const summary = await runTvOfflineAlerts(false, nowMs);
  check("M16b sweep skips email send gate", summary.emailsEnabled === false);
  check(
    "M16b incident row skipped emails disabled",
    insertStatus === "skipped:emails-disabled"
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

process.exit(failed);
