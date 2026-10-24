/**
 * Real tv-sw.js + tv-sw-policy.js stay aligned with lib/tv-sw-policy.ts (F-953).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  tvSwHandlesFetch,
  tvSwShouldSkipFetch,
} from "../lib/tv-sw-policy.ts";

function loadPublicPolicy() {
  const src = readFileSync(
    fileURLToPath(new URL("../public/tv-sw-policy.js", import.meta.url)),
    "utf8"
  );
  const self = {};
  // eslint-disable-next-line no-new-func
  const fn = new Function("self", `${src}; return self.__FH_TV_SW_POLICY;`);
  return fn(self);
}

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const policy = loadPublicPolicy();
const swJs = readFileSync(
  fileURLToPath(new URL("../public/tv-sw.js", import.meta.url)),
  "utf8"
);

check("tv-sw.js imports policy script", swJs.includes('importScripts("/tv-sw-policy.js")'));
check(
  "public policy skips tv-sw.js",
  policy.tvSwShouldSkipFetch("/tv-sw.js", "GET")
);
check(
  "public policy skips API",
  policy.tvSwShouldSkipFetch("/api/tv/state", "GET")
);
check(
  "public policy handles /tv",
  policy.tvSwHandlesFetch("/tv", "GET")
);

const paths = [
  ["/tv-sw.js", false],
  ["/api/tv/state", false],
  ["/tv", true],
  ["/_next/static/x.js", true],
] ;
for (const [path, expect] of paths) {
  check(
    `ts policy matches public for ${path}`,
    tvSwHandlesFetch(path) === expect &&
      policy.tvSwHandlesFetch(path, "GET") === expect
  );
}

// Mutation: if API routes were handled, policy would differ.
check(
  "mutation: handling API would fail parity",
  tvSwHandlesFetch("/api/tv/state") !== true
);
check(
  "skip-fetch blocks non-GET",
  tvSwShouldSkipFetch("/tv", "POST") && policy.tvSwShouldSkipFetch("/tv", "POST")
);

process.exit(failed);
