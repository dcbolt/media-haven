/**
 * TV local media cache — download each video once, play it from the device
 * (Blob transfer leak, part 2, 2026-10-30).
 *
 * Why: the default standby clip is a 105 MB, 140 s MP4 on Vercel Blob. It
 * loops all day on every vacant TV and behind signage. A TV browser cannot
 * keep 105 MB in its media buffer or HTTP disk cache, so every pass of
 * `<video loop>` — and every remount, nightly reload, self-heal reload and
 * deploy reload — pulls the clip from Blob again (~617 passes/day/screen ≈
 * 65 GB/day ≈ $3.2/day per screen). #174 stopped the remount-per-play leak;
 * it could not stop the loop re-reads, because those happen inside the
 * browser's media stack.
 *
 * What this does: the first time a video is needed, one `fetch()` streams it
 * into Cache Storage (disk, survives reloads). Playback then uses a `blob:`
 * object URL made from the cached copy, so loops, remounts and reloads read
 * from local disk. The network is touched again only when:
 * - the server reports a different size for that URL (bytes changed), or
 * - a once-a-day HEAD shows a different Content-Length / Last-Modified
 *   (HEAD transfers no body), or
 * - the URL leaves the playlist (entry pruned) and later comes back.
 *
 * Backwards compatible: if Cache Storage is missing, the download fails, or
 * the disk is full, `resolve()` returns the original URL and the TV streams
 * exactly as before (retry after a back-off, never a fetch loop).
 *
 * Byte budget (F-3732): everything this cache keeps on disk stays within the
 * TV media policy `TV_MEDIA_CACHE_BYTE_CAP` (128 MiB since 2026-10-30, was
 * 96 MiB in #153; docs/tv-memory-audit.md). A video bigger than the cap is
 * never cached — it streams exactly as before. The live 104.8 MB default
 * standby clip fits under 128 MiB, so it is downloaded once.
 *
 * Failure back-off (F-3729) is persisted in localStorage keyed by URL + size,
 * so a disk-full TV does not re-download the clip on every reload; before a
 * download, `navigator.storage.estimate()` must show room for it.
 */

import { MAX_TV_VIDEO_BYTES } from "./tv-video-byte-cap.ts";
import { TV_MEDIA_CACHE_BYTE_CAP } from "./tv-cache-cleanup.ts";
import {
  markPersistentObjectUrl,
  unmarkPersistentObjectUrl,
} from "./tv-media-memory.ts";

export const TV_MEDIA_CACHE_NAME = "fh-tv-media-v1";
export const TV_MEDIA_META_KEY = "fh_tv_media_meta_v1";
/** Revalidate a cached copy with a body-less HEAD at most this often. */
export const TV_MEDIA_REVALIDATE_MS = 24 * 60 * 60 * 1000;
export const TV_MEDIA_FAIL_KEY = "fh_tv_media_fail_v1";
/** After a failed download (network), stream remotely and retry after this long. */
export const TV_MEDIA_FAIL_BACKOFF_MS = 30 * 60 * 1000;
/** After a disk-full / over-budget failure, wait this long (persisted across reloads). */
export const TV_MEDIA_QUOTA_BACKOFF_MS = 24 * 60 * 60 * 1000;
/** Free space beyond the file itself that storage.estimate() must show. */
export const TV_MEDIA_STORAGE_HEADROOM_BYTES = 16 * 1024 * 1024;
/** Total bytes this cache may keep (same policy as the shell media cache). */
export const TV_MEDIA_BYTE_BUDGET = Math.min(TV_MEDIA_CACHE_BYTE_CAP, MAX_TV_VIDEO_BYTES);
/** Keep at most this many videos on disk (LRU beyond the playlist). */
export const TV_MEDIA_MAX_ENTRIES = 6;

export type TvMediaMeta = {
  /** Content-Length of the cached copy. */
  len: number;
  /** Last-Modified of the cached copy ("" when the server sent none). */
  lm: string;
  /** Last time the copy was confirmed current (download or HEAD). */
  checkedAt: number;
  /** Last time it was used (LRU). */
  usedAt: number;
};

export type TvMediaFailReason = "net" | "quota" | "cap";
export type TvMediaFail = { at: number; len?: number; reason: TvMediaFailReason };

export type TvMediaCacheDeps = {
  caches: CacheStorage | null | undefined;
  fetch: typeof fetch;
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
  now: () => number;
  loadMeta: () => Record<string, TvMediaMeta>;
  saveMeta: (m: Record<string, TvMediaMeta>) => void;
  /** navigator.storage.estimate (optional). */
  estimate?: () => Promise<{ quota?: number; usage?: number } | undefined>;
  /** Persisted failure back-off (optional; in-memory when absent). */
  loadFails?: () => Record<string, TvMediaFail>;
  saveFails?: (f: Record<string, TvMediaFail>) => void;
};

class TvMediaCacheError extends Error {
  reason: TvMediaFailReason;
  len?: number;
  constructor(reason: TvMediaFailReason, len?: number) {
    super(`tv media cache: ${reason}`);
    this.reason = reason;
    this.len = len;
  }
}

export type TvMediaHint = { type?: "image" | "video"; bytes?: number };

/** Only real remote videos within the TV size cap are cached locally. */
export function tvMediaCacheable(url: string, hint?: TvMediaHint): boolean {
  if (!url) return false;
  if (hint?.type && hint.type !== "video") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (typeof hint?.bytes === "number" && hint.bytes > TV_MEDIA_BYTE_BUDGET) {
    return false; // over the TV media byte cap: stream as before (F-3732)
  }
  return true;
}

export type TvMediaCacheStats = {
  downloads: number;
  heads: number;
  hits: number;
  fallbacks: number;
};

export function createTvMediaCache(deps: TvMediaCacheDeps) {
  /** url → object URL handed out this session (stable across renders). */
  const local = new Map<string, string>();
  const inflight = new Map<string, Promise<string>>();
  let memFails: Record<string, TvMediaFail> = {};
  let lastKeep = new Set<string>();
  let chain: Promise<unknown> = Promise.resolve(); // one download at a time
  const stats: TvMediaCacheStats = { downloads: 0, heads: 0, hits: 0, fallbacks: 0 };

  function meta(): Record<string, TvMediaMeta> {
    try {
      return deps.loadMeta() ?? {};
    } catch {
      return {};
    }
  }
  function writeMeta(m: Record<string, TvMediaMeta>) {
    try {
      deps.saveMeta(m);
    } catch {
      /* storage full / private mode — cache still works this session */
    }
  }

  function fails(): Record<string, TvMediaFail> {
    if (!deps.loadFails) return memFails;
    try {
      return deps.loadFails() ?? {};
    } catch {
      return memFails;
    }
  }
  function writeFails(f: Record<string, TvMediaFail>) {
    memFails = f;
    try {
      deps.saveFails?.(f);
    } catch {
      /* in-memory back-off still applies this session */
    }
  }
  /** In back-off for this URL + size? A different size means new content: try again. */
  function backedOff(url: string, hint?: TvMediaHint): boolean {
    const f = fails()[url];
    if (!f) return false;
    if (typeof hint?.bytes === "number" && hint.bytes > 0 && f.len !== undefined && f.len !== hint.bytes) {
      return false;
    }
    const wait = f.reason === "net" ? TV_MEDIA_FAIL_BACKOFF_MS : TV_MEDIA_QUOTA_BACKOFF_MS;
    return deps.now() - f.at < wait;
  }
  function recordFail(url: string, reason: TvMediaFailReason, len?: number) {
    const f = fails();
    const t = deps.now();
    for (const [k, v] of Object.entries(f)) {
      if (t - v.at > TV_MEDIA_QUOTA_BACKOFF_MS) delete f[k];
    }
    f[url] = { at: t, reason, ...(len !== undefined ? { len } : {}) };
    writeFails(f);
  }
  function clearFail(url: string) {
    const f = fails();
    if (!(url in f)) return;
    delete f[url];
    writeFails(f);
  }

  /**
   * Size known before downloading: the poll's hint. No extra HEAD — without a
   * hint the GET's Content-Length is checked and the body cancelled when it
   * is over the cap (then a persisted 24 h back-off).
   */
  function sizeOf(hint?: TvMediaHint): number | undefined {
    return typeof hint?.bytes === "number" && hint.bytes > 0 ? hint.bytes : undefined;
  }

  /** Keep total cached bytes + `len` within the budget, evicting LRU non-playlist entries. */
  async function makeRoom(cache: Cache, url: string, len: number) {
    if (len > TV_MEDIA_BYTE_BUDGET) throw new TvMediaCacheError("cap", len);
    const m = meta();
    let total = 0;
    for (const [u, e] of Object.entries(m)) if (u !== url) total += e.len || 0;
    if (total + len <= TV_MEDIA_BYTE_BUDGET) return;
    const evictable = Object.keys(m)
      .filter((u) => u !== url && !lastKeep.has(u))
      .sort((a, b) => (m[a]!.usedAt ?? 0) - (m[b]!.usedAt ?? 0));
    for (const u of evictable) {
      if (total + len <= TV_MEDIA_BYTE_BUDGET) break;
      total -= m[u]!.len || 0;
      delete m[u];
      dropLocal(u);
      await cache.delete(u).catch(() => false);
    }
    writeMeta(m);
    if (total + len > TV_MEDIA_BYTE_BUDGET) throw new TvMediaCacheError("cap", len);
  }

  /** storage.estimate() must show room for the file plus headroom. */
  async function assertDiskRoom(len: number) {
    if (!deps.estimate) return;
    let est: { quota?: number; usage?: number } | undefined;
    try {
      est = await deps.estimate();
    } catch {
      return; // unknown: let put() decide
    }
    if (typeof est?.quota !== "number" || typeof est?.usage !== "number") return;
    if (est.quota - est.usage < len + TV_MEDIA_STORAGE_HEADROOM_BYTES) {
      throw new TvMediaCacheError("quota", len);
    }
  }

  function dropLocal(url: string) {
    const u = local.get(url);
    if (!u) return;
    local.delete(url);
    unmarkPersistentObjectUrl(u);
    try {
      deps.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }

  async function openCache(): Promise<Cache | null> {
    if (!deps.caches) return null;
    try {
      return await deps.caches.open(TV_MEDIA_CACHE_NAME);
    } catch {
      return null;
    }
  }

  async function toLocal(url: string, res: Response): Promise<string> {
    const blob = await res.blob();
    const u = deps.createObjectURL(blob);
    markPersistentObjectUrl(u);
    local.set(url, u);
    return u;
  }

  /** True when a cheap HEAD says the server copy differs from ours. */
  async function changedUpstream(url: string, m: TvMediaMeta): Promise<boolean> {
    stats.heads += 1;
    try {
      const res = await deps.fetch(url, { method: "HEAD", cache: "no-store" });
      if (!res.ok) return false; // can't tell — keep playing the local copy
      const len = Number(res.headers.get("content-length") ?? NaN);
      const lm = res.headers.get("last-modified") ?? "";
      if (Number.isFinite(len) && len !== m.len) return true;
      if (lm && m.lm && lm !== m.lm) return true;
      return false;
    } catch {
      return false; // offline: local copy is the whole point
    }
  }

  async function download(cache: Cache, url: string, hint?: TvMediaHint): Promise<string> {
    const expected = sizeOf(hint);
    if (expected !== undefined) {
      await makeRoom(cache, url, expected);
      await assertDiskRoom(expected);
    }
    stats.downloads += 1;
    let res: Response;
    try {
      res = await deps.fetch(url, { cache: "no-store" });
    } catch {
      throw new TvMediaCacheError("net", expected);
    }
    if (!res.ok) throw new TvMediaCacheError("net", expected);
    const len = Number(res.headers.get("content-length") ?? NaN);
    const lm = res.headers.get("last-modified") ?? "";
    if (Number.isFinite(len) && len > TV_MEDIA_BYTE_BUDGET) {
      await res.body?.cancel().catch(() => undefined);
      throw new TvMediaCacheError("cap", len);
    }
    // put() streams the body to disk; read back the disk-backed copy so the
    // page never holds a second in-memory buffer of the clip.
    try {
      await cache.put(url, res);
    } catch {
      throw new TvMediaCacheError("quota", Number.isFinite(len) ? len : expected);
    }
    const stored = await cache.match(url);
    if (!stored) throw new Error("media cache put lost");
    const m = meta();
    const t = deps.now();
    m[url] = {
      len: Number.isFinite(len) ? len : Number(stored.headers.get("content-length") ?? 0),
      lm,
      checkedAt: t,
      usedAt: t,
    };
    writeMeta(m);
    return toLocal(url, stored);
  }

  async function resolveNow(url: string, hint?: TvMediaHint): Promise<string> {
    const cache = await openCache();
    if (!cache) {
      stats.fallbacks += 1;
      return url;
    }
    const m = meta();
    const entry = m[url];
    const hit = entry ? await cache.match(url) : undefined;
    if (hit && entry) {
      const sizeChanged =
        typeof hint?.bytes === "number" && hint.bytes > 0 && hint.bytes !== entry.len;
      let stale = sizeChanged;
      if (!stale && deps.now() - entry.checkedAt > TV_MEDIA_REVALIDATE_MS) {
        stale = await changedUpstream(url, entry);
        if (!stale) {
          entry.checkedAt = deps.now();
        }
      }
      if (!stale) {
        stats.hits += 1;
        entry.usedAt = deps.now();
        m[url] = entry;
        writeMeta(m);
        return toLocal(url, hit);
      }
      await cache.delete(url).catch(() => false);
    }
    return download(cache, url, hint);
  }

  return {
    stats,
    /** Object URL already handed out this session, if any (sync). */
    peek(url: string): string | null {
      return local.get(url) ?? null;
    },
    /**
     * Sync: does this device already hold a copy worth waiting for? False for
     * a first-ever play or while in back-off — then the page streams the
     * remote URL immediately instead of showing a blank video (F-3728).
     */
    hasLocalCopy(url: string, hint?: TvMediaHint): boolean {
      if (local.has(url)) return true;
      if (!tvMediaCacheable(url, hint) || !deps.caches) return false;
      if (backedOff(url, hint)) return false;
      const e = meta()[url];
      if (!e) return false;
      return !(typeof hint?.bytes === "number" && hint.bytes > 0 && hint.bytes !== e.len);
    },
    /**
     * Local object URL for `url` (downloading it once if needed), or `url`
     * itself when it can't be cached. Never rejects.
     */
    resolve(url: string, hint?: TvMediaHint): Promise<string> {
      if (!tvMediaCacheable(url, hint)) return Promise.resolve(url);
      const known = local.get(url);
      if (known) {
        const m = meta();
        const e = m[url];
        const sizeChanged =
          e && typeof hint?.bytes === "number" && hint.bytes > 0 && hint.bytes !== e.len;
        if (!sizeChanged) return Promise.resolve(known);
        dropLocal(url);
      }
      if (backedOff(url, hint)) {
        stats.fallbacks += 1;
        return Promise.resolve(url);
      }
      const running = inflight.get(url);
      if (running) return running;
      const p = (chain = chain
        .catch(() => undefined)
        .then(() => resolveNow(url, hint)))
        .then(
          (u) => {
            if (u !== url) clearFail(url);
            return u as string;
          },
          (err: unknown) => {
            const e = err instanceof TvMediaCacheError ? err : null;
            recordFail(url, e?.reason ?? "net", e?.len ?? hint?.bytes);
            stats.fallbacks += 1;
            return url; // stream as before — no regression
          }
        )
        .finally(() => inflight.delete(url));
      inflight.set(url, p);
      return p;
    },
    /**
     * Diff-based pruning: keep entries for `urls` (the current playlist) and
     * the most recently used ones up to TV_MEDIA_MAX_ENTRIES; delete the rest
     * from disk. Call only with a successfully polled, non-empty list.
     */
    async retain(urls: Iterable<string>): Promise<string[]> {
      const keep = new Set<string>();
      for (const u of urls) if (u) keep.add(u);
      if (keep.size === 0) return [];
      lastKeep = keep;
      const m = meta();
      const extra = Object.keys(m)
        .filter((u) => !keep.has(u))
        .sort((a, b) => (m[b]!.usedAt ?? 0) - (m[a]!.usedAt ?? 0));
      const room = Math.max(0, TV_MEDIA_MAX_ENTRIES - keep.size);
      const drop = extra.slice(room);
      if (drop.length === 0) return [];
      const cache = await openCache();
      for (const u of drop) {
        delete m[u];
        dropLocal(u);
        await cache?.delete(u).catch(() => false);
      }
      writeMeta(m);
      return drop;
    },
  };
}

export type TvMediaCache = ReturnType<typeof createTvMediaCache>;

function browserDeps(): TvMediaCacheDeps {
  const w = typeof window !== "undefined" ? window : undefined;
  return {
    caches: w && "caches" in w ? w.caches : null,
    fetch: (...a) => fetch(...a),
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    now: () => Date.now(),
    loadMeta: () => {
      const raw = w?.localStorage?.getItem(TV_MEDIA_META_KEY);
      return raw ? (JSON.parse(raw) as Record<string, TvMediaMeta>) : {};
    },
    saveMeta: (m) => w?.localStorage?.setItem(TV_MEDIA_META_KEY, JSON.stringify(m)),
    estimate:
      w?.navigator?.storage?.estimate
        ? () => w.navigator.storage.estimate()
        : undefined,
    loadFails: () => {
      const raw = w?.localStorage?.getItem(TV_MEDIA_FAIL_KEY);
      return raw ? (JSON.parse(raw) as Record<string, TvMediaFail>) : {};
    },
    saveFails: (f) => w?.localStorage?.setItem(TV_MEDIA_FAIL_KEY, JSON.stringify(f)),
  };
}

let shared: TvMediaCache | null = null;
/** Page-wide cache (lazy, browser only). */
export function tvMediaCache(): TvMediaCache {
  shared ??= createTvMediaCache(browserDeps());
  return shared;
}

/** Same media list (URL + type + bytes, in order)? Used to keep poll results stable. */
export function tvMediaListSignature(
  list: ReadonlyArray<{ url: string; type?: string; bytes?: number }> | null | undefined
): string {
  return (list ?? []).map((a) => `${a.type ?? ""}|${a.bytes ?? ""}|${a.url}`).join("\n");
}

/**
 * Diff-based poll: return `prev` (same identity) when the media list did not
 * change, so React effects keyed on it don't re-run every 10 s poll.
 */
export function stableMediaList<T extends { url: string; type?: string; bytes?: number }>(
  prev: T[] | null | undefined,
  next: T[]
): T[] {
  if (prev && tvMediaListSignature(prev) === tvMediaListSignature(next)) return prev;
  return next;
}
