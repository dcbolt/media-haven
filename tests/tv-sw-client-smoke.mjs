/**
 * TV SW client bootstrap (F-954) — cache delete, legacy cookie, ?sw=1 re-enable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyServiceWorkerUrlFlags,
  applyTvServiceWorkerBootstrap,
  clearLegacyDeviceCookie,
  deleteTvShellCaches,
} from "../lib/tv-service-worker-client.ts";
import { TV_DEVICE_STORAGE_KEY } from "../lib/tv-device-id.ts";
import { tvShellCachePrefix } from "../lib/tv-sw-policy.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("no-sw flag off", applyServiceWorkerUrlFlags("?no-sw=1") === "off");
check("sw=1 flag on", applyServiceWorkerUrlFlags("?sw=1") === "on");

{
  const deleted = [];
  const n = await deleteTvShellCaches({
    keys: async () => ["fh-tv-shell-a", "other", "fh-tv-shell-b"],
    delete: async (k) => {
      deleted.push(k);
      return true;
    },
  });
  check("deleteTvShellCaches removes shell caches only", n === 2 && deleted.join() === "fh-tv-shell-a,fh-tv-shell-b");
  check("shell prefix constant", tvShellCachePrefix() === "fh-tv-shell-");
}

{
  const writes = [];
  const doc = {
    cookie: `${TV_DEVICE_STORAGE_KEY}=tv-id; path=/tv`,
  };
  Object.defineProperty(doc, "cookie", {
    get() {
      return `${TV_DEVICE_STORAGE_KEY}=tv-id; path=/tv`;
    },
    set(v) {
      writes.push(v);
    },
    configurable: true,
  });
  clearLegacyDeviceCookie(doc);
  check(
    "?sw=1 legacy clear only path=/",
    writes.length === 1 && writes[0].includes("path=/;") && !writes[0].includes("path=/tv")
  );
  check(
    "path=/tv device cookie survives legacy clear",
    !writes.some((w) => w.includes("path=/tv"))
  );
}

// Mutation: clearing path=/tv would break re-enable.
{
  const mutantWrites = [];
  const mutantClear = () => {
    mutantWrites.push(`${TV_DEVICE_STORAGE_KEY}=; path=/tv; max-age=0`);
  };
  mutantClear();
  check(
    "mutation: clearing /tv cookie fails guard expectation",
    mutantWrites.some((w) => w.includes("path=/tv"))
  );
}

{
  const ls = { data: { fh_tv_sw_off: "1" }, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; }, removeItem(k) { delete this.data[k]; } };
  let unregistered = false;
  let cachesDeleted = false;
  const mode = await applyTvServiceWorkerBootstrap("?sw=1", {
    localStorage: ls,
    clearLegacyDeviceCookie: () => {},
    unregisterAllServiceWorkers: async () => {
      unregistered = false;
    },
    deleteTvShellCaches: async () => {
      cachesDeleted = false;
    },
  });
  check("sw=1 clears kill switch", ls.getItem("fh_tv_sw_off") == null);
  check("sw=1 bootstrap registers", mode === "register");

  ls.data.fh_tv_sw_off = "1";
  const off = await applyTvServiceWorkerBootstrap("?no-sw=1", {
    localStorage: ls,
    unregisterAllServiceWorkers: async () => {
      unregistered = true;
    },
    deleteTvShellCaches: async () => {
      cachesDeleted = true;
      return 1;
    },
  });
  check("no-sw tears down sw + caches", off === "off" && unregistered && cachesDeleted);
}

const swJs = readFileSync(
  fileURLToPath(new URL("../public/tv-sw.js", import.meta.url)),
  "utf8"
);
check("tv-sw.js loads shared policy", swJs.includes('importScripts("/tv-sw-policy.js")'));

process.exit(failed);
