/**
 * Pure checks for TV safe-reload helpers (no browser).
 */
import { tvStateProbeUrl } from "../lib/tv-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "probe uses device id",
  tvStateProbeUrl("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", null) ===
    "/api/tv/state?device=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
);
check(
  "probe uses property preview",
  tvStateProbeUrl(null, "prop-1") === "/api/tv/state?property=prop-1"
);
check("probe null without ids", tvStateProbeUrl(null, null) === null);

process.exit(failed);
