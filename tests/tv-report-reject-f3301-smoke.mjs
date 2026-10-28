/**
 * F-3301 — reject budget: per-IP before global; global only on 404 after lookup.
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

function makeSupabaseMock() {
  const devices = new Map([[PARENT, { property_id: PROP }]]);
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
    if (method === "GET" && url.includes("/app_config")) {
      return json([]);
    }
    if (method === "POST" && url.includes("/app_config")) {
      return json([{ key: "x" }], 201);
    }
    if (method === "PATCH" && url.includes("/app_config")) {
      return json([{ key: "x" }]);
    }
    return json([]);
  };

  function json(data, status = 200) {
    return new Response(JSON.stringify(data ?? []), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  return { fetch, getTvDeviceReads: () => tvDeviceReads };
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
} = await import("../lib/tv-report-reject-limit.ts");
const { NextRequest } = await import("next/server.js");
const { POST } = await import("../app/api/tv/report/route.ts");

const goodPayload = {
  deviceId: PARENT,
  type: "roku",
  mode: "attract",
  foreground: "signage",
  errors: [],
};

{
  resetRateLimitsForTests();
  const abusiveIp = "198.51.100.10";
  const goodIp = "203.0.113.44";
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    for (let i = 0; i < 60; i += 1) {
      const res = await POST(
        new NextRequest("http://localhost/api/tv/report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": abusiveIp,
          },
          body: JSON.stringify({ deviceId: "not-a-uuid", type: "x" }),
        })
      );
      if (i === 0) check("F-3301a malformed returns 400", res.status === 400);
    }
    const ok = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": goodIp,
        },
        body: JSON.stringify(goodPayload),
      })
    );
    check("F-3301a claimed TV on other IP gets 200 after malformed burst", ok.status === 200);
  });
}

{
  resetRateLimitsForTests();
  const fixedNow = 1_700_000_000_000;
  for (let i = 0; i < 400; i += 1) {
    consumeReportRejectBudget(`198.51.100.${i % 250}`, fixedNow, {
      chargeGlobal: true,
    });
  }
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.88",
        },
        body: JSON.stringify(goodPayload),
      })
    );
    check("F-3301b claimed TV 200 when global budget drained", res.status === 200);
  });
}

{
  resetRateLimitsForTests();
  const ip = "198.51.100.77";
  const { fetch, getTvDeviceReads } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    for (let i = 0; i < 60; i += 1) {
      await POST(
        new NextRequest("http://localhost/api/tv/report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ ...goodPayload, deviceId: UNKNOWN }),
        })
      );
    }
    const readsBefore = getTvDeviceReads();
    const capped = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ ...goodPayload, deviceId: UNKNOWN }),
      })
    );
    check("F-3301c per-IP capped returns 429", capped.status === 429);
    check(
      "F-3301c capped unknown uuid zero tv_devices reads",
      getTvDeviceReads() === readsBefore
    );
  });
}

{
  resetRateLimitsForTests();
  const abusiveIp = "198.51.100.250";
  const ipA = "203.0.113.61";
  const ipB = "203.0.113.62";
  const { fetch } = makeSupabaseMock();
  await withRouteEnv(fetch, async () => {
    for (let i = 0; i < 420; i += 1) {
      await POST(
        new NextRequest("http://localhost/api/tv/report", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": abusiveIp,
          },
          body: JSON.stringify({ deviceId: "bad", type: "x" }),
        })
      );
    }
    const resA = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ipA,
        },
        body: JSON.stringify(goodPayload),
      })
    );
    const resB = await POST(
      new NextRequest("http://localhost/api/tv/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ipB,
        },
        body: JSON.stringify(goodPayload),
      })
    );
    check("F-3324 other IP A claimed 200 after 420 malformed", resA.status === 200);
    check("F-3324 other IP B claimed 200 after 420 malformed", resB.status === 200);
  });
}

process.exit(failed);
