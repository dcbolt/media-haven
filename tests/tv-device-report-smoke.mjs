/**
 * POST /api/tv/report + storage (F-3126, F-3156, F-3158).
 */
import { createClient } from "@supabase/supabase-js";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNCLAIMED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const { parseDeviceReportPayload, scrubReportMessage } = await import(
  "../lib/tv-device-report-parse.ts"
);
const {
  persistDeviceReport,
  deviceReportConfigKey,
  isDeviceReportRateLimited,
} = await import("../lib/tv-device-report-store.ts");
const { DEVICE_REPORT_VALUE_MAX_BYTES } = await import(
  "../lib/tv-device-report-types.ts"
);
const { handleTvDeviceReport } = await import("../lib/tv-device-report-handle.ts");
const { assertDeviceReportAllowlist } = await import(
  "../lib/tv-device-report-allowlist.ts"
);
const { sanitizeReportDisplayText } = await import(
  "../lib/tv-device-report-display.ts"
);
const { readRequestBodyCapped } = await import("../lib/read-json-body-capped.ts");
const { canonicalDeviceId, deviceIdForLog } = await import("../lib/tv-device-id.ts");
const { shouldSuppressNewOfflineIncident } = await import(
  "../lib/offline-alert-policy.ts"
);
const { resetRateLimitsForTests } = await import("../lib/in-memory-rate-limit.ts");

{
  const parsed = parseDeviceReportPayload({
    deviceId: PARENT.toUpperCase(),
    type: "not-a-type",
    mode: "attract",
    foreground: "streaming",
    errors: Array.from({ length: 8 }, () => ({
      at: "1999-01-01T00:00:00.000Z",
      code: "x".repeat(100),
      msg: "y",
    })),
    children: [{ deviceId: UNCLAIMED, type: "roku", mode: "attract", foreground: "signage" }],
  });
  check("canonical deviceId lowercase", parsed.ok && parsed.report.deviceId === PARENT);
  check("parse caps errors at 5", parsed.ok && parsed.report.errors.length === 5);
  check(
    "parse caps error code at 64",
    parsed.ok && parsed.report.errors[0].code.length <= 64
  );
}

{
  const cl = await readRequestBodyCapped(
    new ReadableStream({ start(c) { c.close(); } }),
    8192,
    "9000"
  );
  check("content-length over 8kb gives 413", !cl.ok && cl.status === 413);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("x".repeat(9000)));
      c.close();
    },
  });
  const r = await readRequestBodyCapped(stream, 8192, null);
  check("streamed body over 8kb gives 413", !r.ok && r.status === 413);
}

function eqParam(u, name) {
  const raw = u.searchParams.get(name);
  if (!raw?.startsWith("eq.")) return raw;
  return decodeURIComponent(raw.slice(3));
}

function makeSupabaseMock(deviceRows = [[PARENT, { property_id: PROP }]]) {
  const config = new Map();
  const devices = new Map(deviceRows);
  let writes = 0;

  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.includes("/tv_devices")) {
      const u = new URL(url);
      const id = eqParam(u, "id");
      const row = devices.get(id);
      return json(row ? [{ id, property_id: row.property_id }] : []);
    }
    if (method === "PATCH" && url.includes("/tv_devices")) {
      return json([{}]);
    }
    if (method === "DELETE" && url.includes("/tv_devices")) {
      const u = new URL(url);
      const id = eqParam(u, "id");
      devices.delete(id);
      return json([]);
    }
    if (method === "GET" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      if (keyEq) {
        const row = config.get(keyEq);
        return json(row ? [{ key: keyEq, updated_at: row.updated_at, value: row.value }] : []);
      }
      return json([]);
    }
    if (method === "POST" && url.includes("/app_config")) {
      writes += 1;
      const body = JSON.parse(String(init.body));
      if (config.has(body.key)) return json(null, 409, { code: "23505" });
      config.set(body.key, {
        value: body.value,
        updated_at: body.updated_at ?? new Date().toISOString(),
      });
      return json([{ key: body.key }], 201);
    }
    if (method === "PATCH" && url.includes("/app_config")) {
      writes += 1;
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      const updatedEq = eqParam(u, "updated_at");
      const hasUpdatedAtEq = url.includes("updated_at=eq.");
      const cur = config.get(keyEq);
      if (hasUpdatedAtEq && cur?.forceCasFail) return json([]);
      if (hasUpdatedAtEq && (!cur || cur.updated_at !== updatedEq)) {
        return json([]);
      }
      const body = JSON.parse(String(init.body));
      config.set(keyEq, { value: body.value, updated_at: body.updated_at });
      return json([{ key: keyEq }]);
    }
    if (method === "DELETE" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      config.delete(keyEq);
      return json([]);
    }
    return json([]);
  };

  function json(data, status = 200, errBody = null) {
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
  return { db, config, fetch, getWrites: () => writes };
}

{
  const variants = [
    PARENT,
    PARENT.toUpperCase(),
    "Aaaaaaaa-Aaaa-4aaa-8aaa-AaaaaaaaAaaa",
    `  ${PARENT.toUpperCase()}  `,
  ];
  for (const v of variants) {
    check(
      `case variant key canonical ${v.slice(0, 8)}`,
      deviceReportConfigKey(v) === deviceReportConfigKey(PARENT)
    );
  }
  const { db, config } = makeSupabaseMock();
  const report = {
    deviceId: PARENT,
    reportedType: "roku",
    mode: "attract",
    foreground: "signage",
    errors: [],
  };
  for (let i = 0; i < variants.length; i += 1) {
    const t = new Date(Date.parse("2026-10-28T12:00:00.000Z") + i * 20_000).toISOString();
    const r = await persistDeviceReport(
      variants[i],
      report,
      t,
      db
    );
    check(`variant write ${i} ok`, r.ok === true);
  }
  check("four case variants one app_config row", config.size === 1);
}

{
  const report = {
    deviceId: PARENT,
    reportedType: "node",
    mode: "attract",
    foreground: "signage",
    errors: [],
  };
  const t0 = "2026-10-28T12:00:00.000Z";
  const t1 = "2026-10-28T12:00:05.000Z";
  const tGap = "2026-10-28T12:00:20.000Z";
  const key = deviceReportConfigKey(PARENT);

  const { db } = makeSupabaseMock();
  await persistDeviceReport(PARENT, report, t0, db, { requireUpdatedAtCas: true });
  const withCas = await persistDeviceReport(PARENT, report, t1, db, {
    requireUpdatedAtCas: true,
  });
  check("with updated_at CAS rate limits", !withCas.ok && withCas.rateLimited);
  check("with CAS enforced in prod path", !withCas.ok);

  const { db: dbConflict, config: cfgConflict } = makeSupabaseMock();
  await persistDeviceReport(PARENT, report, t0, dbConflict, {
    requireUpdatedAtCas: true,
  });
  cfgConflict.get(key).forceCasFail = true;
  const casConflict = await persistDeviceReport(PARENT, report, tGap, dbConflict, {
    requireUpdatedAtCas: true,
  });
  check("with CAS loses optimistic conflict", !casConflict.ok);

  const { db: db2, config: cfg2 } = makeSupabaseMock();
  await persistDeviceReport(PARENT, report, t0, db2, { requireUpdatedAtCas: false });
  cfg2.get(key).forceCasFail = true;
  const withoutCas = await persistDeviceReport(PARENT, report, tGap, db2, {
    requireUpdatedAtCas: false,
  });
  check(
    "mutation: without CAS wins conflict (must keep CAS in prod)",
    withoutCas.ok === true
  );
}

{
  const huge = {
    deviceId: PARENT,
    reportedType: "web_tv",
    mode: "attract",
    foreground: "signage",
    errors: Array.from({ length: 5 }, () => ({
      at: "",
      code: "x",
      msg: "y".repeat(500),
    })),
    firmware: "f".repeat(3000),
  };
  const { db } = makeSupabaseMock();
  const r = await persistDeviceReport(PARENT, huge, "2026-10-28T12:00:00.000Z", db);
  check("4kb storage cap rejects", !r.ok && r.error === "report too large");
  check("cap constant 4096", DEVICE_REPORT_VALUE_MAX_BYTES === 4096);
}

{
  const { db, config, getWrites } = makeSupabaseMock();
  const serverNow = Date.parse("2026-10-28T15:00:00.000Z");
  const res = await handleTvDeviceReport(
    {
      deviceId: PARENT,
      type: "roku",
      mode: "attract",
      foreground: "signage",
      errors: [{ at: "1990-01-01T00:00:00.000Z", code: "old", msg: "ignored" }],
      children: [
        { deviceId: UNCLAIMED, type: "signboard", mode: "attract", foreground: "signage" },
        { deviceId: UNCLAIMED, type: "roku", mode: "attract", foreground: "signage" },
      ],
    },
    { nowMs: serverNow, dbOverride: db }
  );
  check("handle uses server time", res.ok === true);
  const stored = JSON.parse(
    config.get(deviceReportConfigKey(PARENT)).value
  );
  check(
    "stored receivedAt is server not client error at",
    stored.receivedAt === new Date(serverNow).toISOString()
  );
  check("children produce zero extra writes", getWrites() === 1 && config.size === 1);
}

{
  check("deviceIdForLog valid uuid", deviceIdForLog(PARENT) === PARENT);
  check("deviceIdForLog invalid", deviceIdForLog("not-a-uuid") === "invalid");
  const logLine = JSON.stringify({
    deviceId: deviceIdForLog(PARENT),
    status: 200,
    bytes: 10,
  });
  check("log line has no report body keys", !logLine.includes("foreground"));
}

{
  check(
    "scrub email exact",
    scrubReportMessage("Contact foo@example.com now") === "Contact [redacted] now"
  );
  check(
    "scrub phone exact",
    scrubReportMessage("Call (555) 123-4567 please") === "Call [redacted] please"
  );
  check(
    "scrub query token exact",
    scrubReportMessage("GET https://x.test/path?api_key=supersecret&x=1") ===
      "GET https://x.test/path?api_key=[redacted]&x=[redacted]"
  );
  check(
    "scrub bearer exact",
    scrubReportMessage("Auth Bearer eyJhbGciOiJIUzI1NiJ9.token") ===
      "Auth Bearer [redacted]"
  );
}

{
  const { db } = makeSupabaseMock([[PARENT, { property_id: null }]]);
  const unclaimed = await handleTvDeviceReport(
    {
      deviceId: PARENT,
      type: "roku",
      mode: "attract",
      foreground: "signage",
    },
    { dbOverride: db }
  );
  check("property_id null returns 404", !unclaimed.ok && unclaimed.status === 404);
}

{
  const clean = sanitizeReportDisplayText('<script>x</script>', 200);
  check("display strips script tag", !clean.includes("<script"));
}

{
  const freshStream = {
    receivedAt: new Date().toISOString(),
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
    "legacy streaming hint never suppresses",
    !shouldSuppressNewOfflineIncident(freshStream)
  );
}

{
  resetRateLimitsForTests();
  const { fetch, config } = makeSupabaseMock();
  const key = deviceReportConfigKey(PARENT);
  config.set(key, {
    value: "{}",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = fetch;
  const { deleteDeviceReportConfig } = await import(
    "../lib/tv-device-report-store.ts"
  );
  await deleteDeviceReportConfig(PARENT);
  check(
    "forget path deletes device_report config row",
    !config.has(key)
  );
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

process.exit(failed);
