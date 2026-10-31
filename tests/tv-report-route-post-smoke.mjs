/**
 * Real POST /api/tv/report handler (F-3158 G, F-3248, F-3249).
 */
import "./lib/tv-report-route-register.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNKNOWN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LEAK = "SUPABASE_SECRET_TOKEN_xyz_leak";

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
  let appConfigWrites = 0;

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
    if (method === "GET" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      if (keyEq) {
        if (options.failConfigRead) {
          return json(
            { message: LEAK, code: "PGRST000" },
            500
          );
        }
        const row = config.get(keyEq);
        return json(
          row ? [{ key: keyEq, updated_at: row.updated_at, value: row.value }] : []
        );
      }
      return json([]);
    }
    if (method === "POST" && url.includes("/app_config")) {
      appConfigWrites += 1;
      const body = JSON.parse(String(init.body));
      if (options.failConfigInsert) {
        return json({ message: LEAK, code: "42501" }, 500);
      }
      if (config.has(body.key)) return json(null, 409, { code: "23505" });
      config.set(body.key, {
        value: body.value,
        updated_at: body.updated_at ?? new Date().toISOString(),
      });
      return json([{ key: body.key }], 201);
    }
    if (method === "PATCH" && url.includes("/app_config")) {
      appConfigWrites += 1;
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
  return { fetch, getAppConfigWrites: () => appConfigWrites, config };
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
const { NextRequest } = await import("next/server.js");
const { POST } = await import("../app/api/tv/report/route.ts");
const { FleetReportMetaDisplay } = await import(
  "../lib/fleet-report-meta-display.ts"
);

const payload = {
  deviceId: PARENT,
  type: "roku",
  mode: "attract",
  foreground: "signage",
  errors: [],
};

{
  resetRateLimitsForTests();
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    const body = await res.json();
    check("POST route status 200", res.status === 200);
    check(
      "POST route exact response keys",
      Object.keys(body).sort().join(",") === "nextReportS,ok"
    );
    check("POST route ok true", body.ok === true);
  });
}

{
  resetRateLimitsForTests();
  const logs = [];
  const prevLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  const { fetch } = makeSupabaseMock({ failConfigRead: true });
  let status503 = 0;
  let body503 = "";
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.50",
      },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    status503 = res.status;
    body503 = JSON.stringify(await res.json());
  });
  console.log = prevLog;
  check("503 response status", status503 === 503);
  check("503 body exact ok false only", body503 === '{"ok":false}');
  check("503 body omits DB leak string", !body503.includes(LEAK));
  const joined = logs.join("\n");
  check("503 log omits DB leak string", !joined.includes(LEAK));
  check(
    "503 log uses short err class",
    joined.includes('"err":"persist_read"') ||
      joined.includes('"err":"persist_update"')
  );
}

{
  resetRateLimitsForTests();
  const ip = "203.0.113.99";
  const { fetch } = makeSupabaseMock({ failConfigRead: true });
  await withRouteEnv(fetch, async () => {
    for (let i = 0; i < 60; i += 1) {
      const req = new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(payload),
      });
      const res = await POST(req);
      if (i < 59) check(`503 reject budget consume ${i}`, res.status === 503);
    }
    const capped = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(payload),
      })
    );
    check("503 path exhausts reject budget to 429", capped.status === 429);
  });
}

{
  resetRateLimitsForTests();
  const { fetch, getAppConfigWrites } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, deviceId: UNKNOWN }),
    });
    const res = await POST(req);
    check("unknown device 404", res.status === 404);
    check("unknown device 404 no app_config writes", getAppConfigWrites() === 0);
  });
}

{
  resetRateLimitsForTests();
  const { fetch, getAppConfigWrites } = makeSupabaseMock({
    devices: [[PARENT, { property_id: null }]],
  });
  await withRouteEnv(fetch, async () => {
    const req = new NextRequest("http://localhost/api/tv/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    check("unclaimed device 404", res.status === 404);
    check("unclaimed 404 no app_config writes", getAppConfigWrites() === 0);
  });
}

{
  const xss = '<script>alert(1)</script>\u0000fg';
  const html = renderToStaticMarkup(
    React.createElement(FleetReportMetaDisplay, {
      mode: xss,
      foregroundHint: xss,
      appVersion: null,
      appBuild: null,
      firmware: null,
      feedLastOkAt: null,
      feedLastError: null,
      feedUsingLastGood: null,
      lastErrors: [{ code: xss, msg: xss }],
    })
  );
  check("fleet row component inert script", !html.includes("<script"));
  check("fleet row component strips control chars", !/[\u0000-\u001F]/.test(html));
}

process.exit(failed);
