/**
 * Blob transfer leak part 2 (2026-10-30): each TV video downloads ONCE and
 * then plays from the device (lib/tv-media-cache.ts).
 *
 * Model: a TV screen shows a 140 s standby clip all day = ~617
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
/** The 35 MB re-encode of the standby clip (fits the 96 MiB TV media cap). */
const SIZE = 35_000_000;
/** Today's live clip: 104.8 MB — over the 96 MiB cap, so it must NOT be cached (F-3732). */
const LIVE_SIZE = 104_817_423;
const LIVE = "https://rys7rywziucawk51.public.blob.vercel-storage.com/screensavers/live-105.mp4";
const PASSES_PER_DAY = Math.round(86_400 / 140);

/** Fake "Blob": counts GETs/HEADs; size and last-modified per URL are settable. */
function fakeOrigin() {
  const files = new Map([[CLIP, { len: SIZE, lm: "Thu, 29 Oct 2026 03:52:15 GMT" }], [OTHER, { len: 2_000_000, lm: "Wed, 28 Oct 2026 10:00:00 GMT" }], [LIVE, { len: LIVE_SIZE, lm: "Thu, 29 Oct 2026 03:52:15 GMT" }]]);
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

function makeDeps({ caches, origin, clock, metaStore, failStore = {}, estimate }) {
  let n = 0;
  return {
    estimate,
    loadFails: () => JSON.parse(failStore.v ?? "{}"),
    saveFails: (f) => (failStore.v = JSON.stringify(f)),
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
    origin.files.set(CLIP, { len: 30_000_000, lm: "Sat, 31 Oct 2026 09:00:00 GMT" });
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

  // 6. Disk full (put throws) → original URL; back-off persists across
  //    reloads (F-3729: was 10.07 copies on AUDITOR's reload run).
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const failStore = {};
    const metaStore = {};
    const { caches } = fakeCaches(new Map(), { putThrows: true });
    const first = await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore, failStore })).resolve(CLIP, { type: "video", bytes: SIZE });
    for (let reload = 0; reload < 20; reload++) {
      const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore, failStore }));
      await c.resolve(CLIP, { type: "video", bytes: SIZE });
      clock.t += 30 * 60_000;
    }
    push("quota error → original URL; 20 reloads in 10 h → still 1 download", first === CLIP && origin.gets === 1, `gets=${origin.gets}`);
    clock.t += 15 * 3_600_000;
    await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore, failStore })).resolve(CLIP, { type: "video", bytes: SIZE });
    push("retries after the 24 h quota back-off", origin.gets === 2, `gets=${origin.gets}`);
  }

  // 6b. Network error → short back-off, also persisted.
  {
    const origin = fakeOrigin();
    origin.failGets = true;
    const clock = { t: 0 };
    const failStore = {};
    const { caches } = fakeCaches();
    for (let reload = 0; reload < 10; reload++) {
      await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {}, failStore })).resolve(CLIP, { type: "video", bytes: SIZE });
      clock.t += 60_000;
    }
    push("network error → 1 attempt per 30 min across reloads", origin.gets === 1, `gets=${origin.gets}`);
    clock.t += 31 * 60_000;
    origin.failGets = false;
    const u = await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {}, failStore })).resolve(CLIP, { type: "video", bytes: SIZE });
    push("retries after network back-off and caches", origin.gets === 2 && u.startsWith("blob:"), `gets=${origin.gets} ${u}`);
  }

  // 6c. storage.estimate() shows no room → no download attempted at all.
  {
    const origin = fakeOrigin();
    const { caches } = fakeCaches();
    const estimate = async () => ({ quota: 50_000_000, usage: 30_000_000 });
    const c = createTvMediaCache(makeDeps({ caches, origin, clock: { t: 0 }, metaStore: {}, estimate }));
    const u = await c.resolve(CLIP, { type: "video", bytes: SIZE });
    push("storage.estimate too small → original URL, 0 GETs", u === CLIP && origin.gets === 0, `gets=${origin.gets}`);
    const roomy = async () => ({ quota: 10e9, usage: 1e6 });
    const c2 = createTvMediaCache(makeDeps({ caches, origin, clock: { t: 0 }, metaStore: {}, estimate: roomy }));
    const u2 = await c2.resolve(CLIP, { type: "video", bytes: SIZE });
    push("storage.estimate roomy → cached", u2.startsWith("blob:") && origin.gets === 1, `gets=${origin.gets}`);
  }

  // 6d. 96 MiB TV media cap (F-3732): today's 104.8 MB clip is never cached.
  {
    const origin = fakeOrigin();
    const clock = { t: 0 };
    const failStore = {};
    const { caches, store } = fakeCaches();
    const a = await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {}, failStore })).resolve(LIVE, { type: "video", bytes: LIVE_SIZE });
    push("104.8 MB clip with size hint → streams as before, 0 GETs, 0 HEADs", a === LIVE && origin.gets === 0 && origin.heads === 0 && store.size === 0, `gets=${origin.gets} heads=${origin.heads}`);
    for (let reload = 0; reload < 5; reload++) {
      await createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {}, failStore })).resolve(LIVE, { type: "video" });
    }
    push("104.8 MB clip, no hint → 1 GET cancelled on Content-Length, then persisted cap back-off (5 reloads, no more)", origin.gets === 1 && origin.heads === 0 && store.size === 0, `gets=${origin.gets} heads=${origin.heads}`);
  }

  // 6e. Total budget: two 60 MB playlist videos can't both fit → second streams.
  {
    const origin = fakeOrigin();
    const A = "https://b.example/a60.mp4", B = "https://b.example/b60.mp4", OLD = "https://b.example/old40.mp4";
    origin.files.set(A, { len: 60_000_000, lm: "" });
    origin.files.set(B, { len: 60_000_000, lm: "" });
    origin.files.set(OLD, { len: 40_000_000, lm: "" });
    const clock = { t: 0 };
    const { caches, store } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock, metaStore: {} }));
    await c.resolve(OLD, { type: "video", bytes: 40_000_000 });
    clock.t += 1000;
    await c.retain([A, B]);
    const ua = await c.resolve(A, { type: "video", bytes: 60_000_000 });
    const ub = await c.resolve(B, { type: "video", bytes: 60_000_000 });
    push("byte budget: evicts LRU non-playlist copy to fit A; B over budget streams", ua.startsWith("blob:") && ub === B && store.has(A) && !store.has(OLD) && !store.has(B), `store=${[...store.keys()].map((k) => k.split("/").pop()).join(",")}`);
  }

  // 7. Non-videos / oversize / relative → untouched.
  {
    const origin = fakeOrigin();
    const { caches } = fakeCaches();
    const c = createTvMediaCache(makeDeps({ caches, origin, clock: { t: 0 }, metaStore: {} }));
    const a = await c.resolve("https://x.example/a.jpg", { type: "image" });
    const b = await c.resolve(CLIP, { type: "video", bytes: 400 * 1024 * 1024 });
    push("images and over-cap videos pass through", a === "https://x.example/a.jpg" && b === CLIP && origin.gets === 0);
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
        await deps.fetch(url).catch(() => undefined); // TV media stack re-reads the clip this pass
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
  for (const dep of ["tv-video-byte-cap.ts", "tv-media-memory.ts", "tv-media-url.ts", "tv-cache-cleanup.ts"]) {
    copyFileSync(join(libDir, dep), join(dir, dep));
  }
  const mutants = [
    ["no single-flight", "const running = inflight.get(url);", "const running = undefined as Promise<string> | undefined;"],
    ["memory-only (no disk hit)", "const hit = entry ? await cache.match(url) : undefined;", "const hit = undefined as Response | undefined;"],
    ["ignores new size from poll", "hint.bytes !== entry.len;", "false;"],
    ["no failure back-off", "return deps.now() - f.at < wait;", "return false;"],
    ["back-off not persisted (F-3729)", "if (!deps.loadFails) return memFails;", "return memFails;"],
    ["no storage.estimate check (F-3729)", "if (est.quota - est.usage < len + TV_MEDIA_STORAGE_HEADROOM_BYTES) {", "if (false) {"],
    ["ignores 96 MiB cap (F-3732)", "Math.min(TV_MEDIA_CACHE_BYTE_CAP, MAX_TV_VIDEO_BYTES)", "MAX_TV_VIDEO_BYTES"],
    ["no LRU eviction for budget", ".filter((u) => u !== url && !lastKeep.has(u))", ".filter(() => false)"],
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
  check("F-3728: no local copy on record → remote URL immediately (no blank wait)", /if \(!cache\.hasLocalCopy\(url, \{ type: "video", bytes \}\)\) return url;\s*if \(timedOut === url\) return url;/.test(page));
  check("F-3733: MediaSlide gets a bytes hint", /useLocalVideoSrc\(type === "video" \? url : null, bytes\)/.test(page) && /bytes=\{mediaBytesFor\(c, url\)\}/.test(page));
  check("poll keeps unchanged media list identity", /stableMediaList\(\s*prev\.content\.screensavers/.test(page));
}

process.exit(failed);
