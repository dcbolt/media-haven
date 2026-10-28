/**
 * F-3323 — offline cron sweep: legacy streaming + open incident; email flag gate (M7).
 */
import "./lib/tv-report-route-register.mjs";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OPEN_ID = "11111111-1111-4111-8111-111111111111";
const STALE_LAST = "2026-10-28T10:00:00.000Z";
const FRESH_RX = "2026-10-28T11:59:30.000Z";
const NOW_MS = Date.parse("2026-10-28T12:00:00.000Z");
const REPORT_KEY = `device_report:${PARENT}`;

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

function sweepFetch(options = {}) {
  const { emailFlagRows = [], sendHook = null } = options;
  let recoveredUpdates = 0;
  return {
    fetch: async (input, init) => {
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
              last_seen: STALE_LAST,
              properties: { name: "Test" },
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (method === "GET" && url.includes("/tv_offline_alerts")) {
        return new Response(
          JSON.stringify([{ id: OPEN_ID, tv_device_id: PARENT }]),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (method === "GET" && url.includes("/app_config")) {
        if (url.includes("offline_alert_emails_enabled")) {
          return new Response(JSON.stringify(emailFlagRows), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("device_report")) {
          return new Response(
            JSON.stringify([
              {
                key: REPORT_KEY,
                value: JSON.stringify({
                  receivedAt: FRESH_RX,
                  auth: "legacy",
                  report: {
                    deviceId: PARENT,
                    reportedType: "web_tv",
                    mode: "attract",
                    foreground: "streaming",
                    errors: [],
                  },
                }),
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (url.includes("tv_offline_threshold")) {
          return new Response(JSON.stringify([{ value: "15" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (method === "PATCH" && url.includes("/tv_offline_alerts")) {
        recoveredUpdates += 1;
        return new Response(JSON.stringify([{}]), {
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
    },
    getRecoveredUpdates: () => recoveredUpdates,
    sendHook,
  };
}

async function runSweep(emailFlagRows) {
  const prevResend = process.env.RESEND_API_KEY;
  const prevHost = process.env.HOST_ALERT_EMAILS;
  process.env.RESEND_API_KEY = "re_test_configured";
  process.env.HOST_ALERT_EMAILS = "ops@thefloridahavens.com";
  const { fetch, getRecoveredUpdates } = sweepFetch({ emailFlagRows });
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  globalThis.fetch = fetch;
  const { runTvOfflineAlerts } = await import("../lib/tv-offline-alerts.ts");
  const summary = await runTvOfflineAlerts(false, NOW_MS);
  globalThis.fetch = prevFetch;
  if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  if (prevResend === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = prevResend;
  if (prevHost === undefined) delete process.env.HOST_ALERT_EMAILS;
  else process.env.HOST_ALERT_EMAILS = prevHost;
  return { summary, getRecoveredUpdates };
}

{
  const { alertHeartbeatIso } = await import("../lib/offline-alert-policy.ts");
  const entry = {
    receivedAt: FRESH_RX,
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
    "F-3323a legacy streaming heartbeat literal last_seen",
    alertHeartbeatIso(entry, STALE_LAST, NOW_MS) === STALE_LAST
  );
  const { summary, getRecoveredUpdates } = await runSweep([]);
  check("F-3323a open incident not recovered literal 0", summary.recovered === 0);
  check(
    "F-3323a no recovered PATCH on open incident",
    getRecoveredUpdates() === 0
  );
}

for (const label of ["flag absent", "flag false"]) {
  const rows =
    label === "flag false"
      ? [{ value: "false" }]
      : [];
  const { summary } = await runSweep(rows);
  check(`F-3323b ${label} sent literal 0`, summary.sent === 0);
  check(`F-3323b ${label} emailsEnabled literal false`, summary.emailsEnabled === false);
  check(
    `F-3323b ${label} email configured literal true`,
    summary.emailConfigured === true
  );
}

process.exit(failed);
