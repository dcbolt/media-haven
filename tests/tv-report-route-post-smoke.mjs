/**
 * Real POST /api/tv/report handler (F-3158 G).
 */
import "./lib/tv-report-route-register.mjs";
import { createClient } from "@supabase/supabase-js";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
      return json(row ? [{ id, property_id: row.property_id }] : []);
    }
    if (method === "PATCH" && url.includes("/tv_devices")) {
      return json([{}]);
    }
    if (method === "GET" && url.includes("/app_config")) {
      const u = new URL(url);
      const keyEq = eqParam(u, "key");
      if (keyEq) {
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
  return { fetch };
}

const { resetRateLimitsForTests } = await import("../lib/in-memory-rate-limit.ts");

resetRateLimitsForTests();
const { fetch } = makeSupabaseMock();
const prevFetch = globalThis.fetch;
const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
globalThis.fetch = fetch;

const { NextRequest } = await import("next/server.js");
const { POST } = await import("../app/api/tv/report/route.ts");

const payload = {
  deviceId: PARENT,
  type: "roku",
  mode: "attract",
  foreground: "signage",
  errors: [],
};
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

globalThis.fetch = prevFetch;
if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;

process.exit(failed);
