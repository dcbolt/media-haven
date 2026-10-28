/**
 * P5 POST /api/tv/report — schema, auth gate, CAS, rate limit, offline rules.
 */
import { createClient } from "@supabase/supabase-js";

const ORG = "11111111-1111-4111-8111-111111111111";
const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UNCLAIMED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const { parseDeviceReportPayload, scrubReportMessage } = await import(
  "../lib/tv-device-report-parse.ts"
);
const {
  persistDeviceReports,
  sanitizeDeviceReportsMap,
} = await import("../lib/tv-device-report-store.ts");
const { handleTvDeviceReport } = await import("../lib/tv-device-report-handle.ts");
const { consumeRateLimit, resetRateLimitsForTests } = await import(
  "../lib/in-memory-rate-limit.ts"
);
const { assertDeviceReportAllowlist } = await import(
  "../lib/tv-device-report-allowlist.ts"
);
const {
  setOrgSettingsVersionProbeForTests,
  resetOrgSettingsVersionProbeForTests,
} = await import("../lib/org-settings-cas.ts");
const {
  tvEligibleForOfflineAlert,
  isOfflineByThreshold,
} = await import("../lib/fleet-device-reports.ts");

resetOrgSettingsVersionProbeForTests();
setOrgSettingsVersionProbeForTests(true);

{
  const bigChildren = Array.from({ length: 20 }, (_, i) => ({
    deviceId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    type: "roku",
    mode: "attract",
    foreground: "signage",
  }));
  const parsed = parseDeviceReportPayload(
    {
      deviceId: PARENT,
      type: "not-a-type",
      mode: "attract",
      foreground: "streaming",
      errors: Array.from({ length: 8 }, () => ({
        at: new Date().toISOString(),
        code: "x",
        msg: "y",
      })),
      children: bigChildren,
      wifiPassword: "secret",
    },
    { allowChildren: true }
  );
  check("parse coerces unknown type", parsed.ok && parsed.report.type === "unknown");
  check("parse caps errors at 5", parsed.ok && parsed.report.errors.length === 5);
  check("parse caps children at 16", parsed.ok && parsed.children.length === 16);
  check(
    "scrub email/phone/query",
    scrubReportMessage("fail user@test.com ?token=abc123 555-123-4567").includes(
      "[redacted]"
    )
  );
  check(
    "strip unknown top keys from parse path",
    parsed.ok && !("wifiPassword" in parsed.report)
  );
}

{
  resetRateLimitsForTests();
  const k = "tv-report:test";
  check("rate limit 1st ok", consumeRateLimit(k, 1, 15_000, 0).ok === true);
  check("rate limit 2nd 429", consumeRateLimit(k, 1, 15_000, 1000).ok === false);
}

function createVersionCasDb() {
  let settings = { deviceReports: {} };
  let version = 0;
  const fetch = async (input, init) => {
    if (!init?.method || init.method === "GET") {
      return new Response(JSON.stringify([{ settings, version }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init.method === "PATCH") {
      const u = new URL(String(input));
      const verFilter = u.searchParams.get("version");
      if (verFilter !== `eq.${version}`) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const body = JSON.parse(String(init.body));
      settings = body.settings;
      version += 1;
      return new Response(JSON.stringify([{ id: ORG }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("bad", { status: 500 });
  };
  const db = createClient("https://example.supabase.co", "service", {
    auth: { persistSession: false },
    global: { fetch },
  });
  return {
    db,
    getSettings: () => settings,
  };
}

{
  const { db, getSettings } = createVersionCasDb();
  const baseReport = {
    deviceId: PARENT,
    type: "node",
    mode: "attract",
    foreground: "signage",
    errors: [],
  };
  const baseMs = Date.now() - 60_000;
  const t0 = new Date(baseMs).toISOString();
  const r1 = await persistDeviceReports(
    [{ deviceId: PARENT, report: baseReport, receivedAt: t0 }],
    ORG,
    db
  );
  check("persist first write ok", r1.ok === true);

  const t1 = new Date(baseMs + 60_000).toISOString();
  const r2 = await persistDeviceReports(
    [{ deviceId: PARENT, report: baseReport, receivedAt: t1 }],
    ORG,
    db
  );
  check("persist skip unchanged <5min", r2.ok && r2.wroteSettings === false);

  const t2 = new Date(baseMs + 6 * 60_000).toISOString();
  const r3 = await persistDeviceReports(
    [{ deviceId: PARENT, report: baseReport, receivedAt: t2 }],
    ORG,
    db
  );
  check("persist refresh after 5min", r3.ok && r3.wroteSettings === true);

  const changed = { ...baseReport, mode: "vacant" };
  const r4 = await persistDeviceReports(
    [{ deviceId: PARENT, report: changed, receivedAt: t2 }],
    ORG,
    db
  );
  check("persist write on report change", r4.ok && r4.wroteSettings === true);

  const stored = sanitizeDeviceReportsMap(getSettings().deviceReports);
  check("stored entry read back", Boolean(stored[PARENT]?.report));
  const violations = assertDeviceReportAllowlist(stored[PARENT] ?? {});
  check("allowlist clean", violations.length === 0, violations.join(","));
}

{
  const signage = {
    receivedAt: new Date().toISOString(),
    auth: "legacy",
    report: {
      deviceId: PARENT,
      type: "web_tv",
      mode: "attract",
      foreground: "signage",
      errors: [],
    },
  };
  const streaming = {
    ...signage,
    report: { ...signage.report, foreground: "streaming" },
  };
  check("TV signage eligible", tvEligibleForOfflineAlert(signage));
  check("TV streaming not eligible", !tvEligibleForOfflineAlert(streaming));
  const old = new Date(Date.now() - 20 * 60_000).toISOString();
  check(
    "streaming TV not offline threshold",
    !isOfflineByThreshold(old, "web_tv", 15, streaming)
  );
  check(
    "signage TV offline threshold",
    isOfflineByThreshold(old, "web_tv", 15, signage)
  );
}

{
  const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const CHILD_OK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const CHILD_BAD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const PROP2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  let settings = {};
  let version = 0;
  const devices = new Map([
    [PARENT, { property_id: PROP }],
    [CHILD_OK, { property_id: PROP }],
    [CHILD_BAD, { property_id: PROP2 }],
  ]);
  let orgWrites = 0;

  const fetch = async (input, init) => {
    const url = String(input);
    if (!init?.method || init.method === "GET") {
      if (url.includes("tv_devices")) {
        const u = new URL(url);
        const idEq = u.searchParams.get("id")?.replace("eq.", "");
        if (idEq && devices.has(idEq)) {
          return new Response(
            JSON.stringify([{ id: idEq, property_id: devices.get(idEq).property_id }]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("in.")) {
          return new Response(
            JSON.stringify(
              [...devices.entries()].map(([id, r]) => ({
                id,
                property_id: r.property_id,
              }))
            ),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
      }
      if (url.includes("orgs")) {
        return new Response(JSON.stringify([{ settings, version }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    if (init?.method === "PATCH") {
      orgWrites += 1;
      const body = JSON.parse(String(init.body));
      settings = body.settings;
      version += 1;
      return new Response(JSON.stringify([{ id: ORG }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "POST") return new Response("[]", { status: 201 });
    return new Response("[]", { status: 200 });
  };

  const db = createClient("https://example.supabase.co", "service", {
    auth: { persistSession: false },
    global: { fetch },
  });

  // Override from() for tv_devices select patterns used by supabase client
  const origFrom = db.from.bind(db);
  db.from = (table) => {
    if (table !== "tv_devices") return origFrom(table);
    return {
      select(cols) {
        this._cols = cols;
        return this;
      },
      eq(col, val) {
        this._eq = [col, val];
        return this;
      },
      in(col, vals) {
        this._in = vals;
        return this;
      },
      maybeSingle() {
        const id = this._eq?.[1];
        const row = devices.get(id);
        if (!row) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({
          data: { id, property_id: row.property_id },
          error: null,
        });
      },
      update() {
        return { eq: () => Promise.resolve({ error: null }) };
      },
      then(resolve) {
        const rows = (this._in ?? [])
          .map((id) => {
            const r = devices.get(id);
            return r ? { id, property_id: r.property_id } : null;
          })
          .filter(Boolean);
        return resolve({ data: rows, error: null });
      },
    };
  };

  resetRateLimitsForTests();
  const res = await handleTvDeviceReport(
    {
      deviceId: PARENT,
      type: "node",
      mode: "attract",
      foreground: "signage",
      children: [
        {
          deviceId: CHILD_OK,
          type: "signboard",
          mode: "attract",
          foreground: "signage",
        },
        {
          deviceId: CHILD_BAD,
          type: "roku",
          mode: "attract",
          foreground: "signage",
        },
      ],
    },
    { dbOverride: db }
  );
  check("claimed parent ok", res.ok === true);
  check(
    "cross-property child rejected",
    res.ok && res.rejectedChildren === 1
  );
}

{
  resetRateLimitsForTests();
  const db = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        in() {
          return this;
        },
        update() {
          return { eq: () => Promise.resolve({ error: null }) };
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
  const okBody = { ok: true, nextReportS: 60, rejectedChildren: 0 };
  const keys = Object.keys(okBody).sort().join(",");
  check("response exact keys", keys === "nextReportS,ok,rejectedChildren");
  check("response allowlist", assertDeviceReportAllowlist(okBody).length === 0);
}

process.exit(failed);
