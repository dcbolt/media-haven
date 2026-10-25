/**
 * Optional poll telemetry query suffix — no server schema required.
 */
import { tvPollTelemetryQuerySuffix } from "../lib/tv-poll-telemetry.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

globalThis.performance = { now: () => 12_345 };

const suffix = tvPollTelemetryQuerySuffix();
check("suffix starts with ampersand", suffix.startsWith("&"));
check("suffix includes uptime_s", suffix.includes("uptime_s=12"));

process.exit(failed);
