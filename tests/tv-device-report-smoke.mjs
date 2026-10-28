/**
 * P5 POST /api/tv/report — F-3126 security contract tests.
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
const { handleTvDeviceReport } = await import("../lib/tv-device-report-handle.ts");
const { assertDeviceReportAllowlist } = await import(
  "../lib/tv-device-report-allowlist.ts"
);
const {
  tvForegroundHintAllowsOfflineAlert,
  isOfflineByThreshold,
} = await import("../lib/fleet-device-reports.ts");
const { sanitizeReportDisplayText } = await import(
  "../lib/tv-device-report-display.ts"
);
const { readRequestBodyCapped } = await import("../lib/read-json-body-capped.ts");

{
  const parsed = parseDeviceReportPayload({
    deviceId: PARENT,
    type: "not-a-type",
    mode: "attract",
    foreground: "streaming",
    errors: Array.from({ length: 8 }, () => ({
      at: new Date().toISOString(),
      code: "x".repeat(100),
      msg: "y",
    })),
    children: [{ deviceId: UNCLAIMED, type: "roku", mode: "attract", foreground: "signage" }],
    wifiPassword: "secret",
  });
  check(
    "parse stores reportedType hint",
    parsed.ok && parsed.report.reportedType === "unknown"
  );
  check("parse caps errors at 5", parsed.ok && parsed.report.errors.length === 5);
  check(
    "parse caps error code at 64",
    parsed.ok && parsed.report.errors[0].code.length <= 64
  );
  check("soft mode ignores children in payload", parsed.ok);
  check(
    "scrub email/phone/query",
    scrubReportMessage("fail user@test.com ?token=abc123 555-123-4567").includes(
      "[redacted]"
    )
  );
}

{
  const big = "x".repeat(9000);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(big));
      c.close();
    },
  });
  const r = await readRequestBodyCapped(stream, 8192, null);
  check("body stream cap 413", !r.ok && r.status === 413);
}

function eqParam(u, name) {
  const raw = u.searchParams.get(name);
  if (!raw?.startsWith("eq.")) return raw;
  return decodeURIComponent(raw.slice(3));
}

function makeSupabaseMock() {
  const config = new Map();
  const devices = new Map([[PARENT, { property_id: PROP }]]);

  const fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url.includes("/tv_devices")) {
      const u = new URL(url);
      const id = eqParam(u, "id");
      const row = devices.get(id);
      const body = row ? [{ id, property_id: row.property_id }] : [];
      return json(body);
    }

    if (method === "PATCH" && url.includes("/tv_devices")) {
      return json([{}]);
    }

    if (method === "GET" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      if (keyEq) {
        const row = config.get(keyEq);
        return json(row ? [{ key: keyEq, updated_at: row.updated_at, value: row.value }] : []);
      }
      if (url.includes("like")) {
        const rows = [...config.entries()]
          .filter(([k]) => k.startsWith("device_report:"))
          .map(([key, v]) => ({ key, value: v.value }));
        return json(rows);
      }
      return json([]);
    }

    if (method === "POST" && url.includes("/app_config")) {
      const body = JSON.parse(String(init.body));
      if (config.has(body.key)) {
        return json(null, 409, { code: "23505" });
      }
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
      const cur = config.get(keyEq);
      if (!cur || cur.updated_at !== updatedEq) {
        return json([]);
      }
      const body = JSON.parse(String(init.body));
      config.set(keyEq, { value: body.value, updated_at: body.updated_at });
      return json([{ key: keyEq }]);
    }

    return json([]);
  };

  function json(data, status = 200, errBody = null) {
    if (status === 409) {
      return new Response(JSON.stringify(errBody), { status: 409 });
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  const db = createClient("https://example.supabase.co", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return { db, config };
}

{
  const { db, config } = makeSupabaseMock();
  const report = {
    deviceId: PARENT,
    reportedType: "node",
    mode: "attract",
    foreground: "signage",
    errors: [],
  };
  const t0 = "2026-10-28T12:00:00.000Z";
  const r1 = await persistDeviceReport(PARENT, report, t0, db);
  check("persist app_config ok", r1.ok === true);
  const key = deviceReportConfigKey(PARENT);
  const stored = JSON.parse(config.get(key).value);
  check("stored receivedAt server", stored.receivedAt === t0);
  check("allowlist clean", assertDeviceReportAllowlist(stored).length === 0);

  const t1 = "2026-10-28T12:00:05.000Z";
  const r2 = await persistDeviceReport(PARENT, report, t1, db);
  check("db rate limit 429", !r2.ok && r2.rateLimited === true);
  check(
    "rate limit predicate",
    isDeviceReportRateLimited("2026-10-28T12:00:00.000Z", "2026-10-28T12:00:05.000Z")
  );
}

{
  const { db, config } = makeSupabaseMock();
  const nowMs = Date.parse("2026-10-28T12:00:00.000Z");
  const res = await handleTvDeviceReport(
    {
      deviceId: PARENT,
      type: "roku",
      mode: "attract",
      foreground: "signage",
      children: [
        { deviceId: UNCLAIMED, type: "signboard", mode: "attract", foreground: "signage" },
      ],
    },
    { nowMs, dbOverride: db }
  );
  check("handle success", res.ok === true);
  check("response has nextReportS only extra", res.ok && res.nextReportS === 60);
  check("only one app_config row (no children)", config.size === 1);
}

{
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        update() {
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  const res = await handleTvDeviceReport(
    {
      deviceId: UNCLAIMED,
      type: "roku",
      mode: "attract",
      foreground: "signage",
    },
    { dbOverride: db }
  );
  check("unclaimed 404", !res.ok && res.status === 404);
}

{
  const signage = {
    receivedAt: new Date().toISOString(),
    auth: "legacy",
    report: {
      deviceId: PARENT,
      reportedType: "web_tv",
      mode: "attract",
      foreground: "signage",
      errors: [],
    },
  };
  const streaming = {
    ...signage,
    report: { ...signage.report, foreground: "streaming" },
  };
  check("TV signage hint allows alert path", tvForegroundHintAllowsOfflineAlert(signage));
  check("TV streaming hint suppresses", !tvForegroundHintAllowsOfflineAlert(streaming));
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  check(
    "streaming TV not offline by server heartbeat",
    !isOfflineByThreshold(old, "web_tv", 15, streaming)
  );
}

{
  const xss = '<script>alert(1)</script>\u0000fg';
  const clean = sanitizeReportDisplayText(xss, 200);
  check("display strips script tag", !clean.includes("<script"));
  check("display strips control chars", !/[\u0000-\u001F]/.test(clean));
}

{
  const okBody = { ok: true, nextReportS: 60 };
  const keys = Object.keys(okBody).sort().join(",");
  check("response exact keys", keys === "nextReportS,ok");
}

process.exit(failed);
