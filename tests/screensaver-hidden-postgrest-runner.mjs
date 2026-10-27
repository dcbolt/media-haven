/**
 * Spawns the PostgREST integration body with --experimental-strip-types (same as smoke.mjs).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const body = fileURLToPath(
  new URL("./screensaver-hidden-postgrest-integration.mjs", import.meta.url)
);
const r = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--no-warnings", body],
  { encoding: "utf8", env: process.env }
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status === null ? 1 : r.status);
