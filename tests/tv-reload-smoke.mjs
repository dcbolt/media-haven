/**
 * TV safe-reload + reachability probes (no browser).
 */
import {
  canAutoReloadTv,
  consumeReloadBudgetIfNeeded,
  getTvAutoReloadCount,
  forceReloadAlreadyHandled,
  markForceReloadHandled,
  probeTvStateReachable,
  recordTvAutoReload,
  resetTvAutoReloadCount,
  TV_MAX_AUTO_RELOADS,
  tvStateProbeUrl,
} from "../lib/tv-reload.ts";
import { urlDeviceMayBind } from "../lib/tv-device-id.ts";
import {
  scrubGuestPrivacyFromState,
  LAST_GOOD_TTL_MS,
} from "../lib/tv-last-good-policy.ts";

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

check("last-good ttl is 48h", LAST_GOOD_TTL_MS === 48 * 60 * 60 * 1000);

const pastCheckout = {
  mode: "active",
  content: {
    propertyName: "Shell",
    occupied: true,
    guestFirstName: "Pat",
    guestLabel: "Pat",
    guestLastName: "Smith",
    checkOut: new Date(Date.now() - 86400_000).toISOString(),
    sections: [],
    photos: [],
    screensavers: [],
    timing: { slideMs: 20000, fadeMs: 2500 },
  },
};
const scrubbed = scrubGuestPrivacyFromState(pastCheckout);
check(
  "scrub drops guest after checkout",
  scrubbed.content.guestFirstName === null &&
    scrubbed.content.occupied === false
);

check(
  "url device binds when no existing id",
  urlDeviceMayBind("?device=aaa", null)
);
check(
  "url device ignored when id exists",
  !urlDeviceMayBind("?device=bbb", "aaa")
);
check(
  "url device binds on repair",
  urlDeviceMayBind("?device=bbb&repair=1", "aaa")
);

// Mutant killer: res.ok true on 302 must NOT count as reachable (F-883).
{
  const mockFetch = async () => ({
    status: 302,
    ok: true,
  });
  const reachable = await probeTvStateReachable(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null,
    mockFetch
  );
  check("302 redirect does not pass reachability gate", !reachable);
}

{
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ mode: "demo", content: { propertyName: "X" } }),
  });
  const reachable = await probeTvStateReachable(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null,
    mockFetch
  );
  check("200 valid JSON passes reachability gate", reachable);
}

{
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ html: true }),
  });
  const reachable = await probeTvStateReachable(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null,
    mockFetch
  );
  check("200 HTML-shaped JSON fails reachability gate (F-1143)", !reachable);
}

// Reload budget — minimal sessionStorage mock for node.
{
  const store = {};
  globalThis.sessionStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
  check("max auto reload constant", TV_MAX_AUTO_RELOADS === 3);
  resetTvAutoReloadCount();
  check("auto reload allowed initially", canAutoReloadTv());
  for (let i = 0; i < TV_MAX_AUTO_RELOADS; i++) recordTvAutoReload();
  check("auto reload capped after 3", !canAutoReloadTv());
  resetTvAutoReloadCount();
  for (let i = 0; i < 10; i++) {
    check(`exempt reload ${i} skips budget`, consumeReloadBudgetIfNeeded("exempt"));
  }
  check(
    "exempt reloads leave budget intact",
    canAutoReloadTv() && getTvAutoReloadCount() === 0
  );
  for (let i = 0; i < TV_MAX_AUTO_RELOADS; i++) {
    check(
      `budgeted gate ${i} open before record`,
      consumeReloadBudgetIfNeeded("budgeted")
    );
    recordTvAutoReload();
  }
  check("budgeted reloads exhaust cap", !canAutoReloadTv());
  check(
    "failed probes do not consume budget (gate only)",
    consumeReloadBudgetIfNeeded("budgeted") === false &&
      getTvAutoReloadCount() === TV_MAX_AUTO_RELOADS
  );
  resetTvAutoReloadCount();
  for (let i = 0; i < 20; i++) {
    check(
      `budget gate without record ${i}`,
      consumeReloadBudgetIfNeeded("budgeted") && getTvAutoReloadCount() === 0
    );
  }
  resetTvAutoReloadCount();
  check("healthy poll resets budget", canAutoReloadTv());

  markForceReloadHandled("stamp-a", false);
  check(
    "force stamp skipped when reload not issued",
    !forceReloadAlreadyHandled("stamp-a")
  );
  markForceReloadHandled("stamp-b", true);
  check(
    "force stamp saved only after reload issued",
    forceReloadAlreadyHandled("stamp-b")
  );
}

process.exit(failed);
