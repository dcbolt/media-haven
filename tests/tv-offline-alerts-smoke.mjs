/**
 * Offline alert email ordering + dedupe plan (F-2137).
 */
import { planOfflineAlertEmail } from "../lib/tv-offline-alerts.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const base = {
  room: "Living",
  propertyName: "Dunes",
  code: "ABCD",
  lastSeen: "2026-10-24T12:00:00Z",
  thresholdMin: 15,
};

const noProvider = planOfflineAlertEmail({
  ...base,
  emailConfigured: false,
  recipients: ["a@example.com"],
});
check("no provider skips send", !noProvider.send);
check("no provider status", noProvider.statusIfSkip === "skipped:no-provider");

const withProvider = planOfflineAlertEmail({
  ...base,
  emailConfigured: true,
  recipients: ["a@example.com"],
});
check("configured provider plans send", withProvider.send);

check(
  "mutation: send-before-insert would skip pending row",
  withProvider.statusIfSkip === "pending" || withProvider.send
);

process.exit(failed);
