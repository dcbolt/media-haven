/** Same TTL as `lib/tv-last-good-policy.ts`. */
const LAST_GOOD_TTL_MS = 48 * 60 * 60 * 1000;

/** Same key as `lib/tv-client-cache.ts`. */
const LAST_GOOD_KEY = "fh_tv_last_good";

/** Same as `TV_DEVICE_STORAGE_KEY` in `lib/tv-device-id.ts`. */
const TV_DEVICE_STORAGE_KEY = "fh_tv_device";

/** Same as `tvShellCachePrefix()` in `lib/tv-sw-policy.ts`. */
const TV_SHELL_CACHE_PREFIX = "fh-tv-shell-";

function revokeObjectUrlIfBlob(url: string | null | undefined): void {
  if (!url?.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

/** Minimal shape for playlist URL collection (avoids importing `lib/tv.ts` in Node smoke). */
export type TvPlaylistStateLike = {
  mode: string;
  content: {
    heroPhoto?: string | null;
    logoUrl?: string | null;
    photos?: string[];
    screensavers?: { url?: string }[];
    playlist?: { items?: { url?: string }[] } | null;
    vacantPlaylist?: { items?: { url?: string }[] } | null;
  };
};

/** Total playlist media bytes to retain in Cache Storage (evict oldest over cap). */
export const TV_MEDIA_CACHE_BYTE_CAP = 96 * 1024 * 1024;

const LOCAL_ALWAYS_KEEP = new Set([TV_DEVICE_STORAGE_KEY, "fh_tv_sw_off"]);
const SESSION_ALWAYS_KEEP = new Set([TV_DEVICE_STORAGE_KEY]);
const SESSION_FORCE_RELOAD_PREFIX = "fh_force_reload_";
const SESSION_CMD_PREFIX = "fh_tv_cmd_";
export const SESSION_RELOAD_BUDGET_KEY = "fh_tv_auto_reload_count";
const FORCE_RELOAD_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export type CacheEntryMeta = { url: string; size: number; index: number };

export function shellCacheNamesToDelete(
  cacheNames: string[],
  shellRev: string,
  prefix = TV_SHELL_CACHE_PREFIX
): string[] {
  const keep = `${prefix}${shellRev}`;
  return cacheNames.filter((n) => n.startsWith(prefix) && n !== keep);
}

/** Drop cache entries not in the playlist; `/tv` navigation shell is always kept. */
export function cacheEntryUrlsToDrop(
  entryUrls: string[],
  playlistUrls: Iterable<string>,
  navigationPaths = ["/tv"]
): string[] {
  const keep = new Set<string>();
  for (const u of playlistUrls) {
    if (u) keep.add(u);
  }
  const nav = new Set(navigationPaths);
  return entryUrls.filter((raw) => {
    try {
      const u = new URL(raw);
      if (nav.has(u.pathname)) return false;
      return !keep.has(raw);
    } catch {
      return true;
    }
  });
}

/** Evict oldest entries first until total size is at or under the cap. */
export function cacheUrlsToEvictForByteCap(
  entries: CacheEntryMeta[],
  maxBytes: number
): string[] {
  let total = entries.reduce((s, e) => s + e.size, 0);
  if (total <= maxBytes) return [];
  const sorted = [...entries].sort((a, b) => a.index - b.index);
  const evicted: string[] = [];
  for (const e of sorted) {
    if (total <= maxBytes) break;
    evicted.push(e.url);
    total -= e.size;
  }
  return evicted;
}

export function localStorageKeysToPrune(
  keys: string[],
  getValue: (key: string) => string | null,
  nowMs: number
): string[] {
  const remove: string[] = [];
  for (const key of keys) {
    if (LOCAL_ALWAYS_KEEP.has(key)) continue;
    if (key === LAST_GOOD_KEY) {
      const raw = getValue(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: string };
        const savedAt = parsed?.savedAt;
        if (
          !savedAt ||
          nowMs - new Date(savedAt).getTime() > LAST_GOOD_TTL_MS
        ) {
          remove.push(key);
        }
      } catch {
        remove.push(key);
      }
      continue;
    }
  }
  return remove;
}

export function sessionStorageKeysToPrune(
  keys: string[],
  nowMs: number
): string[] {
  return keys.filter((key) => {
    if (SESSION_ALWAYS_KEEP.has(key)) return false;
    if (key === SESSION_RELOAD_BUDGET_KEY) return true;
    if (key.startsWith(SESSION_CMD_PREFIX)) return true;
    if (key.startsWith(SESSION_FORCE_RELOAD_PREFIX)) {
      const stamp = key.slice(SESSION_FORCE_RELOAD_PREFIX.length);
      const t = Date.parse(stamp);
      if (Number.isNaN(t)) return true;
      return nowMs - t > FORCE_RELOAD_MAX_AGE_MS;
    }
    return false;
  });
}

export function collectPlaylistMediaUrls(
  state: { mode: string; content?: TvPlaylistStateLike["content"] } | null
): string[] {
  if (!state || (state.mode !== "demo" && state.mode !== "active")) return [];
  const c = state.content;
  if (!c) return [];
  const out = new Set<string>();
  const add = (u: string | null | undefined) => {
    const t = u?.trim();
    if (t) out.add(t);
  };
  add(c.heroPhoto);
  add(c.logoUrl);
  for (const p of c.photos ?? []) add(p);
  for (const a of c.screensavers ?? []) add(a.url);
  for (const it of c.playlist?.items ?? []) add(it.url);
  for (const it of c.vacantPlaylist?.items ?? []) add(it.url);
  return [...out];
}

export type TvNightlyCacheCleanupInput = {
  shellRev: string;
  playlistUrls: string[];
  blobUrlsToRevoke?: string[];
  navigationOrigin?: string;
};

export type TvCacheCleanupDeps = {
  caches?: Pick<CacheStorage, "keys" | "open" | "delete"> | null;
  localStorage?: Storage | null;
  sessionStorage?: Storage | null;
  now?: () => number;
};

export type TvCacheCleanupReport = {
  deletedCaches: string[];
  droppedCacheUrls: string[];
  byteCapEvictedUrls: string[];
  localKeysRemoved: string[];
  sessionKeysRemoved: string[];
  blobsRevoked: number;
};

export async function runTvNightlyCacheCleanup(
  input: TvNightlyCacheCleanupInput,
  deps: TvCacheCleanupDeps = {}
): Promise<TvCacheCleanupReport> {
  const nowMs = deps.now?.() ?? Date.now();
  const report: TvCacheCleanupReport = {
    deletedCaches: [],
    droppedCacheUrls: [],
    byteCapEvictedUrls: [],
    localKeysRemoved: [],
    sessionKeysRemoved: [],
    blobsRevoked: 0,
  };

  for (const url of input.blobUrlsToRevoke ?? []) {
    if (url?.startsWith("blob:")) {
      revokeObjectUrlIfBlob(url);
      report.blobsRevoked += 1;
    }
  }

  const ls = deps.localStorage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (ls) {
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k) keys.push(k);
    }
    for (const k of localStorageKeysToPrune(keys, (key) => ls.getItem(key), nowMs)) {
      ls.removeItem(k);
      report.localKeysRemoved.push(k);
    }
  }

  const ss =
    deps.sessionStorage ??
    (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (ss) {
    const keys: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k) keys.push(k);
    }
    for (const k of sessionStorageKeysToPrune(keys, nowMs)) {
      ss.removeItem(k);
      report.sessionKeysRemoved.push(k);
    }
  }

  const cachesApi =
    deps.caches ?? (typeof caches !== "undefined" ? caches : null);
  if (!cachesApi) return report;

  const names = await cachesApi.keys();
  report.deletedCaches = shellCacheNamesToDelete(names, input.shellRev);
  for (const name of report.deletedCaches) {
    await cachesApi.delete(name);
  }

  const shellName = `${TV_SHELL_CACHE_PREFIX}${input.shellRev}`;
  if (!names.includes(shellName) && !report.deletedCaches.includes(shellName)) {
    return report;
  }
  const cache = await cachesApi.open(shellName);
  const requests = await cache.keys();
  const entryUrls = requests.map((r) => r.url);
  const navOrigin = input.navigationOrigin ?? "";
  const playlistWithNav = [...input.playlistUrls];
  if (navOrigin) playlistWithNav.push(`${navOrigin.replace(/\/$/, "")}/tv`);

  for (const drop of cacheEntryUrlsToDrop(entryUrls, playlistWithNav)) {
    await cache.delete(drop);
    report.droppedCacheUrls.push(drop);
  }

  const remaining = await cache.keys();
  const metas: CacheEntryMeta[] = [];
  let idx = 0;
  for (const req of remaining) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    metas.push({ url: req.url, size: blob.size, index: idx++ });
  }
  for (const evict of cacheUrlsToEvictForByteCap(
    metas,
    TV_MEDIA_CACHE_BYTE_CAP
  )) {
    await cache.delete(evict);
    report.byteCapEvictedUrls.push(evict);
  }

  return report;
}
