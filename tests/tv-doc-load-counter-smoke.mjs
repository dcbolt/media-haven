/**
 * /tv document load counter middleware (F-956) — pure function checks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const src = readFileSync(
  fileURLToPath(new URL("../middleware.ts", import.meta.url)),
  "utf8"
);
check("middleware exports load cookie name", src.includes("fh_tv_doc_loads"));
check("middleware exports load header", src.includes("x-fh-tv-load-count"));
check("middleware matches /tv", src.includes('"/tv"'));
check("reset query param supported", src.includes("__tv_load_reset"));

process.exit(failed);
