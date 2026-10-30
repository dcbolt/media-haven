/**
 * Blob transfer leak part 2 (2026-10-30): each TV video downloads ONCE and
 * then plays from the device (lib/tv-media-cache.ts).
 *
 * Model: a TV screen shows the 105 MB / 140 s standby clip all day = ~617
 * passes/day (each loop pass, remount or reload asks for the clip again,
 * because the TV's media buffer / HTTP cache can't hold 105 MB). We count the
 * full-body GETs that reach "Blob" over those passes.
 *
 * Negative control: `legacyResolve` (what main does — hand the remote URL to
 * <video>) must FAIL the same assertions. Mutants of the real module (copied
 * to a temp dir and edited) must each be caught.
 */
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const CLIP = "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/drone_dunes_v2_smooth.mp4";
const OTHER = "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/other.mp4";
const SIZE = 104_817_423;
const PASSES_PER_DAY = Math.round(86_400 / 140);

/** Fake "Blob": counts GETs/HEADs; size and last-modified per URL are settable. */
function fakeOrigin() {
  const files = new Map([[CLIP, { len: SIZE, lm: "Thu, 29 Oct 2026 03:52:15 GMT" }], [OTHER, { len: 2_000_000, lm: "Wed, 28 Oct 2026 10:00:00 GMT" }]]);
  const o = { gets: 0, heads: 0, files, failGets: false };
  o.fetch = async (url, init = {}) => {
    const f = files.get(url);
    if (!f) return new Response("", { status: 404 });
    const headers = { "content-length": String(f.len), "last-modified": f.lm, "content-type": "video/mp4" };
    if (init.method === "HEAD") {
      o.heads += 1;
      return new Response(null, { status: 200, headers });
    }
    o.gets += 1;
    if (o.failGets) throw new TypeError("network down");
    // Small stand-in body; headers carry the real size.
    return new Response(new Uint8Array(16), { status: 200, headers });
  };
  return o;
}

/** Fake CacheStorage that persists across "reloads" (shared Map). */
function fakeCaches(store = new Map(), { putThrows = false } = {}) {
  const cache = {
    async put(url, res) {
      if (putThrows) throw new DOMException("quota", "QuotaExceededError");
      const body = new Uint8Array(await res.arrayBuffer());
      store.set(url, { body, headers: Object.fromEntries(res.headers) });
    },
    async match(url) {
      const e = store.get(url);
      return e ? new Response(e.body, { headers: e.headers }) : undefined;
    },
    async delete(url) {
      return store.delete(url);
    },
  };
  return { store, caches: { open: async () => cache } };
}

function makeDeps({ caches, origin, clock, metaStore }) {
  let n = 0;
  return {
    caches,
    fetch: origin.fetch,
    createObjectURL: () => `blob:https://tv.local/${++n}`,
    revokeObjectURL: () => {},
    now: () => clock.t,
    loadMeta: () => JSON.parse(metaStore.v ?? "{}"),
    saveMeta: (m) => (metaStore.v = JSON.stringify(m)),
  };
}

async function runAssertions(mod, label) {
  const out = [];
  const push = (n, p, d = "") => out.push([`${label}: ${n}`, p, d]);
  const { createTvMediaCache } = mod;

  // 1. A day of passes on one screen → one download.
  {
    const origin = fakeOrigin();
    const clock = { t: Date.parse("2026-10-30T12:00:00Z") };
    const metaStore = {};
    const { caches } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
    const srcs = new Set();
    for (let i = 0; i < PASSES_PER_DAY; i++) {
      srcs.add(await c.resolve(CLIP, { type: "video", bytes: SIZE }));
      clock.t += 140_000;
    }
    push(`one screen, ${PASSES_PER_DAY} passes/day → 1 download`, origin.gets === 1, `gets=${origin.gets}`);
    const only = [...srcs];
    push("plays a local blob: URL, stable across passes", only.length === 1 && only[0].startsWith("blob:"), only.join(","));
  }

  // 2. Reloads (nightly, self-heal, deploy) reuse the on-disk copy.
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const metaStore = {};
    const { caches } = fakeCaches();
    for (let reload = 0; reload < 5; reload++) {
      const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
      await c.resolve(CLIP, { type: "video", bytes: SIZE });
      clock.t += 4 * 3_600_000;
    }
    push("5 page reloads in a day → still 1 download", origin.gets === 1, `gets=${origin.gets}`);
  }

  // 3. Standby + signage bg + preloader asking at once → single flight.
  {
    const origin = fakeOrigin();
    const { caches } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock: { t: 0 }, metaStore: {} }));
    const r = await Promise.all([1, 2, 3, 4].map(() => c.resolve(CLIP, { type: "video" })));
    push("4 concurrent asks → 1 download, same URL", origin.gets === 1 && new Set(r).size === 1, `gets=${origin.gets}`);
  }

  // 4. Changed upstream: size from the poll, or daily body-less HEAD.
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const metaStore = {};
    const { caches } = fakeCaches();
    let c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
    await c.resolve(CLIP, { type: "video", bytes: SIZE });
    origin.files.set(CLIP, { len: 20_000_000, lm: "Fri, 30 Oct 2026 09:00:00 GMT" });
    await c.resolve(CLIP, { type: "video", bytes: 20_000_000 });
    push("poll reports new size → re-download once", origin.gets === 2, `gets=${origin.gets}`);
    clock.t += 25 * 3_600_000;
    c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
    await c.resolve(CLIP, { type: "video" });
    push("next day, unchanged → 1 HEAD, no GET", origin.gets === 2 && origin.heads === 1, `gets=${origin.gets} heads=${origin.heads}`);
    clock.t += 25 * 3_600_000;
    origin.files.set(CLIP, { len: 35_000_000, lm: "Sat, 31 Oct 2026 09:00:00 GMT" });
    c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
    await c.resolve(CLIP, { type: "video" });
    push("next day, swapped in place (HEAD differs) → re-download", origin.gets === 3, `gets=${origin.gets} heads=${origin.heads}`);
  }

  // 5. No Cache Storage → original URL (exactly today's behaviour).
  {
    const origin = fakeOrigin();
    const c = createTvMediaCache(makeDeps({ caches: null, origin, clock: { t: 0 }, metaStore: {} }));
    const u = await c.resolve(CLIP, { type: "video" });
    push("no Cache Storage → original URL, no extra GET", u === CLIP && origin.gets === 0, u);
  }

  // 6. Disk full / network error → original URL, back-off (no fetch storm).
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const { caches } = fakeCaches(new Map(), { putThrows: true });
    const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {} }));
    const u1 = await c.resolve(CLIP, { type: "video" });
    for (let i = 0; i < 50; i++) {
      await c.resolve(CLIP, { type: "video" });
      clock.t += 10_000;
    }
    push("quota error → original URL, 1 attempt per back-off window", u1 === CLIP && origin.gets === 1, `gets=${origin.gets}`);
    clock.t += 31 * 60_000;
    await c.resolve(CLIP, { type: "video" });
    push("retries after back-off", origin.gets === 2, `gets=${origin.gets}`);
  }

  // 7. Non-videos / oversize / relative → untouched.
  {
    const origin = fakeOrigin();
    const { caches } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock: { t: 0 }, metaStore: {} }));
    const a = await c.resolve("https://x.example/a.jpg", { type: "image" });
    const b = await c.resolve(CLIP, { type: "video", bytes: 400 * 1024 * 1024 });
    push("images and >150 MB videos pass through", a === "https://x.example/a.jpg" && b === CLIP && origin.gets === 0);
  }

  // 8. Diff-based prune: removed videos leave the disk (beyond the LRU cap).
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const metaStore = {};
    const { caches, store } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore }));
    for (let i = 0; i < 8; i++) {
      const u = `https://b.example/v${i}.mp4`;
      origin.files.set(u, { len: 1000 + i, lm: "" });
      await c.resolve(u, { type: "video" });
      clock.t += 1000;
    }
    await c.resolve(CLIP, { type: "video" });
    const none = await c.retain([]);
    push("retain([]) (failed/empty poll) prunes nothing", none.length === 0 && store.size === 9, `size=${store.size}`);
    const dropped = await c.retain([CLIP]);
    push("retain keeps playlist + 5 most recent, prunes the rest", store.has(CLIP) && store.size === mod.TV_MEDIA_MAX_ENTRIES && dropped.length === 3, `size=${store.size} dropped=${dropped.length}`);
  }

  // 9. Poll diff: unchanged media list keeps identity.
  {
    const prev = [{ url: CLIP, type: "video", bytes: SIZE }];
    const same = [{ url: CLIP, type: "video", bytes: SIZE }];
    const changed = [{ url: OTHER, type: "video", bytes: 1 }];
    push("stableMediaList: unchanged poll → same array", mod.stableMediaList(prev, same) === prev);
    push("stableMediaList: changed poll → new array", mod.stableMediaList(prev, changed) === changed);
  }
  return out;
}

/** What main does today: the <video> gets the remote URL; every pass reads it. */
function legacyModule() {
  return {
    TV_MEDIA_MAX_ENTRIES: 6,
    stableMediaList: (_p, n) => n,
    createTvMediaCache: (deps) => ({
      async resolve(url) {
        await deps.fetch(url); // TV media stack re-reads the clip this pass
        return url;
      },
      peek: () => null,
      async retain() {
        return [];
      },
    }),
  };
}

const libDir = fileURLToPath(new URL("../lib/", import.meta.url));
const real = await import(pathToFileURL(join(libDir, "tv-media-cache.ts")).href);

for (const [n, p, d] of await runAssertions(real, "fix")) check(n, p, d);

// Negative control.
{
  const res = await runAssertions(legacyModule(), "legacy");
  const bad = res.filter(([, p]) => !p).length;
  check("negative control: main's behaviour fails the download-once assertions", bad >= 5, `${bad}/${res.length} legacy assertions failed`);
  const day = res.find(([n]) => n.includes("passes/day"));
  console.log(`INFO  legacy one-screen day: ${day?.[2]} (≈ ${(Number(/gets=(\d+)/.exec(day?.[2] ?? "")?.[1] ?? 0) * SIZE / 1e9).toFixed(1)} GB ≈ $${(Number(/gets=(\d+)/.exec(day?.[2] ?? "")?.[1] ?? 0) * SIZE / 1e9 * 0.05).toFixed(2)}/day at $0.05/GB)`);
}

// Mutants of the real module must be caught.
{
  const src = readFileSync(join(libDir, "tv-media-cache.ts"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "tv-media-cache-mut-"));
  for (const dep of ["tv-video-byte-cap.ts", "tv-media-memory.ts", "tv-media-url.ts"]) {
    copyFileSync(join(libDir, dep), join(dir, dep));
  }
  const mutants = [
    ["no single-flight", "const running = inflight.get(url);", "const running = undefined as Promise<string> | undefined;"],
    ["memory-only (no disk hit)", "const hit = entry ? await cache.match(url) : undefined;", "const hit = undefined as Response | undefined;"],
    ["ignores new size from poll", "hint.bytes !== entry.len;", "false;"],
    ["no failure back-off", "deps.now() - failed < TV_MEDIA_FAIL_BACKOFF_MS", "false"],
    ["retain prunes on empty list", "if (keep.size === 0) return [];", ""],
    ["unchanged poll gets new identity", "=== tvMediaListSignature(next)) return prev;", "=== tvMediaListSignature(next) && false) return prev;"],
  ];
  let i = 0;
  for (const [name, from, to] of mutants) {
    if (!src.includes(from)) {
      check(`mutant "${name}" applies`, false, "pattern not found");
      continue;
    }
    const file = join(dir, `tv-media-cache-m${i++}.ts`);
    writeFileSync(file, src.replace(from, to));
    const mod = await import(pathToFileURL(file).href);
    const res = await runAssertions(mod, name);
    const caught = res.some(([, p]) => !p);
    check(`mutant caught: ${name}`, caught, res.filter(([, p]) => !p).map(([n]) => n).join("; "));
  }
}

// Revoke guard: element release must not revoke the cache's object URL.
{
  const mem = await import(pathToFileURL(join(libDir, "tv-media-memory.ts")).href);
  const revoked = [];
  const orig = URL.revokeObjectURL;
  URL.revokeObjectURL = (u) => revoked.push(u);
  mem.markPersistentObjectUrl("blob:https://tv.local/keep");
  mem.revokeObjectUrlIfBlob("blob:https://tv.local/keep");
  mem.revokeObjectUrlIfBlob("blob:https://tv.local/other");
  URL.revokeObjectURL = orig;
  check("release keeps cache-owned object URLs, still revokes others", revoked.length === 1 && revoked[0].endsWith("/other"), revoked.join(","));
}

// Page wiring (source guards): every playing video goes through the cache,
// and the standby photo timer no longer keys on asset identity (F-3462).
{
  const page = readFileSync(fileURLToPath(new URL("../app/tv/page.tsx", import.meta.url)), "utf8");
  check("Standby <video> src is the local copy", /ref=\{standbyVideoRef\}\s*src=\{videoSrc \?\? undefined\}/.test(page));
  check("signage background <video> src is the local copy", /ref=\{bgVideoRef\}\s*src=\{bgVideoSrc \?\? undefined\}/.test(page));
  check("media-block <video> src is the local copy", /ref=\{videoRef\}\s*src=\{videoSrc \?\? undefined\}/.test(page));
  check("F-3462: photo dwell not keyed on asset identity", !/\}, \[asset, assetIndex, advance\]\);/.test(page) && /\[assetUrl, assetType, assetIndex, advance\]/.test(page));
  check("poll keeps unchanged media list identity", /stableMediaList\(\s*prev\.content\.screensavers/.test(page));
}

process.exit(failed);
