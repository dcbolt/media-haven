/**
 * F-3155/F-3157 offline alert policy + cron auth route contract.
 */
import { verifyCronBearer } from "../lib/cron-auth.ts";
import {
  alertHeartbeatIso,
  effectiveOfflineThresholdMinutes,
  isDeviceStaleForAlerts,
  isReportFresh,
  shouldSuppressNewOfflineIncident,
} from "../lib/offline-alert-policy.ts";
let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = Date.parse("2026-10-28T12:00:00.000Z");
const oldLastSeen = "2026-10-28T11:00:00.000Z";
const freshReceived = "2026-10-28T11:59:30.000Z";
const staleReceived = "2026-10-28T10:00:00.000Z";

{
  check(
    "legacy TV no report uses last_seen threshold",
    isDeviceStaleForAlerts(oldLastSeen, 15, now)
  );
  check(
    "legacy threshold minutes without report",
    effectiveOfflineThresholdMinutes(undefined, 15, now) === 15
  );
}

{
  const staleStreaming = {
    receivedAt: staleReceived,
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
    "stale streaming hint does not suppress",
    !shouldSuppressNewOfflineIncident(staleStreaming, now)
  );
  check(
    "stale report heartbeat falls back to last_seen",
    alertHeartbeatIso(staleStreaming, oldLastSeen, now) === oldLastSeen
  );
}

{
  const freshStreamingLegacy = {
    receivedAt: freshReceived,
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
    "legacy fresh streaming does not suppress (Auditor 2 A)",
    !shouldSuppressNewOfflineIncident(freshStreamingLegacy, now)
  );
  check(
    "legacy fresh report heartbeat stays last_seen",
    alertHeartbeatIso(freshStreamingLegacy, oldLastSeen, now) === oldLastSeen
  );
  check(
    "legacy node type still uses host threshold",
    effectiveOfflineThresholdMinutes(freshStreamingLegacy, 15, now) === 15
  );
}

{
  const freshStreamingToken = {
    receivedAt: freshReceived,
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
    "token fresh streaming suppresses new incident",
    shouldSuppressNewOfflineIncident(freshStreamingToken, now)
  );
  check(
    "token fresh report uses receivedAt heartbeat",
    alertHeartbeatIso(freshStreamingToken, oldLastSeen, now) === freshReceived
  );
}

{
  const openIncidentStays = !shouldSuppressNewOfflineIncident(undefined, now) &&
    isDeviceStaleForAlerts(oldLastSeen, 15, now);
  check("no report still eligible for stale alert", openIncidentStays);
}

{
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "offline-test-secret";
  check("offline cron rejects missing auth", !verifyCronBearer(null));
  check(
    "offline cron rejects wrong bearer",
    !verifyCronBearer("Bearer offline-test-secret-wrong")
  );
  check(
    "offline cron accepts bearer",
    verifyCronBearer("Bearer offline-test-secret")
  );
  process.env.CRON_SECRET = "";
  check("offline cron fails closed unset secret", !verifyCronBearer("Bearer offline-test-secret"));
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
}

{
  const freshStreamingLegacy = {
    receivedAt: freshReceived,
    auth: "legacy",
    report: {
      deviceId: PARENT,
      reportedType: "web_tv",
      mode: "attract",
      foreground: "streaming",
      errors: [],
    },
  };
  const hb = alertHeartbeatIso(freshStreamingLegacy, oldLastSeen, now);
  const stale = isDeviceStaleForAlerts(hb, 15, now);
  const openId = "incident-1";
  const wouldRecover = !stale && openId;
  check(
    "spoofed streaming report does not close open incident",
    stale && !wouldRecover
  );
}

{
  const offsetHeartbeat = "2026-10-28T07:00:00-05:00";
  const offsetNow = Date.parse("2026-10-28T13:30:00.000Z");
  check(
    "F-3164 offset timestamp stale via epoch ms",
    isDeviceStaleForAlerts(offsetHeartbeat, 15, offsetNow)
  );
  check(
    "F-3164 offset timestamp fresh via epoch ms",
    !isDeviceStaleForAlerts(offsetHeartbeat, 120, offsetNow)
  );
}

process.exit(failed);
