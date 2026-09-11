/**
 * Signage ambience sanitizer / URL-flag fixtures (no browser, no Web Audio).
 * Printed as NDJSON for tests/smoke.mjs to fold into the suite tally.
 *
 *   node --experimental-strip-types --no-warnings tests/ambience-smoke.mjs
 *
 * Blast radius: parse + resolve only. Live kiosk resume still needs Fully
 * Kiosk / a real TV; this proves host JSON and ?ambience= flags.
 */
import { runAmbienceFixtures } from "../lib/ambience.ts";

const results = runAmbienceFixtures();
for (const row of results) {
  console.log(JSON.stringify(row));
}
if (results.some((r) => !r.pass)) process.exit(1);
