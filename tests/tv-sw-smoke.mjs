/**
 * Service worker routing rules (mirrors public/tv-sw.js).
 */
import {
  tvSwHandlesFetch,
  TV_STATE_PROBE_FETCH_INIT,
} from "../lib/tv-sw-policy.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("SW ignores tv-sw.js", !tvSwHandlesFetch("/tv-sw.js"));
check("SW ignores API routes", !tvSwHandlesFetch("/api/tv/state"));
check("SW handles /tv navigation shell", tvSwHandlesFetch("/tv"));
check(
  "SW handles static assets",
  tvSwHandlesFetch("/_next/static/chunks/main.js")
);
check(
  "state probe uses redirect manual",
  TV_STATE_PROBE_FETCH_INIT.redirect === "manual"
);

process.exit(failed);
