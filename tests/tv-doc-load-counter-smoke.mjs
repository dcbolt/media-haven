/**
 * /tv document load counter (F-956 / F-970 / F-973).
 */
import { nextTvDocLoadCount } from "../lib/tv-harness-load-counter.ts";
import { tvHarnessLoadCounterEnabled } from "../lib/tv-harness-middleware.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "production Vercel env disables harness helper",
  tvHarnessLoadCounterEnabled() === (process.env.VERCEL_ENV !== "production")
);

{
  const doc = nextTvDocLoadCount({
    pathname: "/tv",
    reset: false,
    isDocument: true,
    previousCount: 1,
    harnessEnabled: true,
  });
  check("document load increments", doc.count === 2 && doc.setHeader);
  check("reset zeroes count", nextTvDocLoadCount({
    pathname: "/tv",
    reset: true,
    isDocument: true,
    previousCount: 9,
    harnessEnabled: true,
  }).count === 0);
  check(
    "harness off skips counter",
    nextTvDocLoadCount({
      pathname: "/tv",
      reset: false,
      isDocument: true,
      previousCount: 1,
      harnessEnabled: false,
    }).setHeader === false
  );
  check(
    "mutant extra reload detectable",
    nextTvDocLoadCount({
      pathname: "/tv",
      reset: false,
      isDocument: true,
      previousCount: 4,
      harnessEnabled: true,
    }).count === 5
  );
}

process.exit(failed);
