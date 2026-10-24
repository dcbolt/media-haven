/**
 * Poll reload wiring (F-952 / F-961) — same exports /tv uses, with mutation checks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  canAutoReloadTv,
  consumeReloadBudgetIfNeeded,
  getTvAutoReloadCount,
  forceReloadAlreadyHandled,
  recordTvAutoReload,
  resetTvAutoReloadCount,
  TV_MAX_AUTO_RELOADS,
} from "../lib/tv-reload.ts";
import {
  onTvStatePollSuccess,
  tvAckForceReload,
  tvPollFailedReloadAttempt,
  tvRecordBudgetedReloadForTest,
} from "../lib/tv-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)),
  "utf8"
);
check(
  "page calls onTvStatePollSuccess after successful poll",
  /\bonTvStatePollSuccess\s*\(\s*\)/.test(pageSrc)
);
check(
  "page acks force reload stamp with reloaded flag",
  /\.then\(\s*\(\s*reloaded\s*\)\s*=>\s*tvAckForceReload\s*\(\s*stamp\s*,\s*reloaded\s*\)/.test(
    pageSrc
  )
);
check(
  "page uses tvPollFailedReloadAttempt on sustained poll failure",
  /\btvPollFailedReloadAttempt\s*\(\s*deviceId\s*,\s*previewProperty\s*\)/.test(
    pageSrc
  )
);

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

resetTvAutoReloadCount();
for (let i = 0; i < TV_MAX_AUTO_RELOADS; i++) tvRecordBudgetedReloadForTest();
check("budget exhausted before healthy poll", !canAutoReloadTv());

onTvStatePollSuccess();
check("healthy poll resets budget via page helper", canAutoReloadTv());

// Mutation: noop success handler leaves budget exhausted.
resetTvAutoReloadCount();
for (let i = 0; i < TV_MAX_AUTO_RELOADS; i++) recordTvAutoReload();
const noopSuccess = () => {};
noopSuccess();
check(
  "mutation: noop onTvStatePollSuccess fails guard",
  !canAutoReloadTv()
);

tvAckForceReload("stamp-no", false);
check(
  "force stamp skipped when reload not issued",
  !forceReloadAlreadyHandled("stamp-no")
);
tvAckForceReload("stamp-yes", true);
check(
  "force stamp saved only after reload issued",
  forceReloadAlreadyHandled("stamp-yes")
);

// Mutation: ack without reloaded=true must not stamp.
tvAckForceReload("stamp-mutant", true);
const mutantAck = (stamp) => tvAckForceReload(stamp, false);
mutantAck("stamp-mutant2");
check(
  "mutation: wrong ack polarity leaves stamp unset",
  !forceReloadAlreadyHandled("stamp-mutant2")
);

{
  const mockFetch = async () => ({ status: 200, ok: true });
  globalThis.fetch = mockFetch;
  let reloads = 0;
  globalThis.window = {
    location: { reload() { reloads += 1; } },
  };
  resetTvAutoReloadCount();
  check(
    "budgeted poll reload gate open",
    consumeReloadBudgetIfNeeded("budgeted")
  );
  const started = await tvPollFailedReloadAttempt(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null
  );
  check("tvPollFailedReloadAttempt reloads on 200", started && reloads === 1);
  check(
    "tvPollFailedReloadAttempt records budget",
    getTvAutoReloadCount() === 1
  );
  delete globalThis.window;
}

process.exit(failed);
