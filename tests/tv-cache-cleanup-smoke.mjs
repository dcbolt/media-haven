/**
 * Nightly TV cache / storage cleanup rules (pure, no browser).
 */
import {
  cacheEntryUrlsToDrop,
  cacheUrlsToEvictForByteCap,
  collectPlaylistMediaUrls,
  localStorageKeysToPrune,
  SESSION_RELOAD_BUDGET_KEY,
  sessionStorageKeysToPrune,
  runTvNightlyCacheCleanup,
  shellCacheNamesToDelete,
  TV_MEDIA_CACHE_BYTE_CAP,
} from "../lib/tv-cache-cleanup.ts";
import { TV_DEVICE_STORAGE_KEY } from "../lib/tv-device-id.ts";

const LAST_GOOD_KEY = "fh_tv_last_good";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "stale shell caches deleted",
  shellCacheNamesToDelete(
    ["fh-tv-shell-abc", "fh-tv-shell-old", "other"],
    "abc"
  ).join() === "fh-tv-shell-old"
);

check(
  "playlist media kept in cache plan",
  cacheEntryUrlsToDrop(
    ["https://x/tv", "https://cdn/a.jpg", "https://cdn/b.jpg"],
    ["https://cdn/a.jpg"]
  ).join() === "https://cdn/b.jpg"
);

check(
  "byte cap evicts oldest first",
  cacheUrlsToEvictForByteCap(
    [
      { url: "a", size: 50, index: 0 },
      { url: "b", size: 50, index: 1 },
      { url: "c", size: 50, index: 2 },
    ],
    80
  ).join() === "a,b"
);

check(
  "device id never pruned from session",
  !sessionStorageKeysToPrune(
    [TV_DEVICE_STORAGE_KEY, SESSION_RELOAD_BUDGET_KEY, "fh_tv_cmd_x"],
    Date.now()
  ).includes(TV_DEVICE_STORAGE_KEY)
);

check(
  "session reload budget reset nightly",
  sessionStorageKeysToPrune([SESSION_RELOAD_BUDGET_KEY], Date.now()).includes(
    SESSION_RELOAD_BUDGET_KEY
  )
);

const staleGood = JSON.stringify({
  savedAt: new Date(Date.now() - 999 * 86400_000).toISOString(),
  state: { mode: "active" },
});
check(
  "expired last-good local key pruned",
  localStorageKeysToPrune(
    [LAST_GOOD_KEY, TV_DEVICE_STORAGE_KEY],
    (k) => (k === LAST_GOOD_KEY ? staleGood : "device-uuid"),
    Date.now()
  ).includes(LAST_GOOD_KEY) &&
    !localStorageKeysToPrune(
      [TV_DEVICE_STORAGE_KEY],
      () => "x",
      Date.now()
    ).includes(TV_DEVICE_STORAGE_KEY)
);

const demoState = {
  mode: "demo",
  content: {
    photos: ["https://cdn/p1.jpg"],
    screensavers: [{ url: "https://cdn/v1.mp4", type: "video" }],
    playlist: { items: [{ key: "m1", url: "https://cdn/m1.mp4" }], photos: true },
    vacantPlaylist: null,
    heroPhoto: null,
    logoUrl: null,
  },
};
const urls = collectPlaylistMediaUrls(demoState);
check(
  "collect playlist urls from state",
  urls.includes("https://cdn/p1.jpg") && urls.includes("https://cdn/m1.mp4")
);

check("media cache cap is 128 MiB", TV_MEDIA_CACHE_BYTE_CAP === 128 * 1024 * 1024);
{
  // Nightly cleanup at 128 MiB: the 104.8 MB standby clip + small assets stay;
  // a second big file still evicts oldest-first down to the cap.
  const LIVE = 104_817_423;
  const keepAll = cacheUrlsToEvictForByteCap(
    [
      { url: "https://cdn/clip.mp4", size: LIVE, index: 0 },
      { url: "https://cdn/p1.jpg", size: 2_000_000, index: 1 },
    ],
    TV_MEDIA_CACHE_BYTE_CAP
  );
  check("128 MiB cap keeps the 104.8 MB clip + photo", keepAll.length === 0, keepAll.join(","));
  const over = cacheUrlsToEvictForByteCap(
    [
      { url: "https://cdn/clip.mp4", size: LIVE, index: 0 },
      { url: "https://cdn/other.mp4", size: 35_000_000, index: 1 },
    ],
    TV_MEDIA_CACHE_BYTE_CAP
  );
  check("128 MiB cap still evicts oldest when over (139.8 MB)", over.length === 1 && over[0] === "https://cdn/clip.mp4", over.join(","));
  const { MAX_TV_VIDEO_BYTES } = await import("../lib/tv-video-byte-cap.ts");
  check("cache cap ≤ MAX_TV_VIDEO_BYTES (budget really is the cap)", TV_MEDIA_CACHE_BYTE_CAP <= MAX_TV_VIDEO_BYTES);
}

/** Minimal CacheStorage mock for runTvNightlyCacheCleanup. */
function mockCaches(entriesByName) {
  const stores = new Map();
  for (const [name, urls] of Object.entries(entriesByName)) {
    const map = new Map();
    for (const url of urls) {
      map.set(url, {
        blob: async () => ({ size: url.length * 1000 }),
      });
    }
    stores.set(name, map);
  }
  return {
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async open(name) {
      let map = stores.get(name);
      if (!map) {
        map = new Map();
        stores.set(name, map);
      }
      return {
        async keys() {
          return [...map.keys()].map((url) => ({ url }));
        },
        async match(req) {
          const url = typeof req === "string" ? req : req.url;
          return map.get(url) ?? null;
        },
        async delete(url) {
          return map.delete(url);
        },
      };
    },
  };
}

function mockStorage(initial = {}) {
  const data = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    key(i) {
      return Object.keys(data)[i] ?? null;
    },
    getItem(k) {
      return data[k] ?? null;
    },
    removeItem(k) {
      delete data[k];
    },
    setItem(k, v) {
      data[k] = v;
    },
    _data: data,
  };
}

const ls = mockStorage({
  [LAST_GOOD_KEY]: JSON.stringify({
    savedAt: new Date(Date.now() - 999 * 86400_000).toISOString(),
    state: {},
  }),
  [TV_DEVICE_STORAGE_KEY]: "keep-me",
});
const ss = mockStorage({
  [TV_DEVICE_STORAGE_KEY]: "keep-me",
  fh_tv_auto_reload_count: "2",
  fh_tv_cmd_dead: "1",
});

const report = await runTvNightlyCacheCleanup(
  {
    shellRev: "rev1",
    playlistUrls: ["https://cdn/keep.mp4"],
    blobUrlsToRevoke: [],
    navigationOrigin: "https://stay.example",
  },
  {
    caches: mockCaches({
      "fh-tv-shell-old": ["https://cdn/stale.mp4"],
      "fh-tv-shell-rev1": [
        "https://stay.example/tv",
        "https://cdn/keep.mp4",
        "https://cdn/drop.mp4",
      ],
    }),
    localStorage: ls,
    sessionStorage: ss,
    now: () => Date.now(),
  }
);

check(
  "nightly run deletes stale shell cache",
  report.deletedCaches.includes("fh-tv-shell-old")
);
check(
  "nightly run drops non-playlist cache urls",
  report.droppedCacheUrls.includes("https://cdn/drop.mp4")
);
check(
  "nightly run keeps device id in localStorage",
  ls.getItem(TV_DEVICE_STORAGE_KEY) === "keep-me"
);
check(
  "nightly run prunes session reload budget",
  report.sessionKeysRemoved.includes("fh_tv_auto_reload_count")
);

process.exit(failed);
