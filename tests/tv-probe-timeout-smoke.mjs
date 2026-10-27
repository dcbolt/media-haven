/**
 * F-1147 — state probe fetch must not hang self-heal (AbortController ~8s).
 */
import {
  TV_STATE_PROBE_TIMEOUT_MS,
  probeTvStateReachable,
} from "../lib/tv-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("probe timeout is ~8s", TV_STATE_PROBE_TIMEOUT_MS === 8_000);

const t0 = Date.now();
const hangFetch = async (_url, init) => {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
};

const ok = await probeTvStateReachable(
  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  null,
  hangFetch
);
const elapsed = Date.now() - t0;

check("hanging fetch fails probe", !ok);
check("hanging fetch aborts under 10s", elapsed < 10_000);
check(
  "mutation: instant resolve without abort would pass (not tested here)",
  !ok
);

process.exit(failed);
