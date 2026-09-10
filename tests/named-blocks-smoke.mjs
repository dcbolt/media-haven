/**
 * Named-block occupancy fixtures (no browser, no Supabase).
 * Printed as NDJSON for tests/smoke.mjs to fold into the suite tally.
 *
 *   node --experimental-strip-types --no-warnings tests/named-blocks-smoke.mjs
 */
import { runNamedBlockFixtures } from "../lib/named-blocks.ts";

const results = runNamedBlockFixtures();
for (const row of results) {
  console.log(JSON.stringify(row));
}
if (results.some((r) => !r.pass)) process.exit(1);
