import {
  resolveTvMediaUrl,
  tvMediaUrlSet,
} from "./tv-media-url.ts";

/** Cap warmed slide / standby media so long-run TVs do not hoard decoders. */

export const TV_WARM_MEDIA_CAP = 4;

export { resolveTvMediaUrl, tvMediaUrlSet } from "./tv-media-url.ts";

/** Drop warm videos whose resolved src is not in the keep set (F-1145). */
export function applyPreloaderVideoRetention(
  root: ParentNode,
  keepUrls: Iterable<string>,
  baseHref?: string
): void {
  const keep = tvMediaUrlSet(keepUrls, baseHref);
  root.querySelectorAll("video").forEach((video) => {
    const attrSrc = video.getAttribute("src") || "";
    const currentSrc = video.currentSrc || "";
    const resolvedAttr = resolveTvMediaUrl(attrSrc, baseHref);
    const resolvedCurrent = resolveTvMediaUrl(currentSrc, baseHref);
    const shouldKeep =
      (resolvedAttr && keep.has(resolvedAttr)) ||
      (resolvedCurrent && keep.has(resolvedCurrent));
    if (!shouldKeep) releaseVideoElement(video);
  });
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const resolved = resolveTvMediaUrl(src, baseHref);
    if (resolved && !keep.has(resolved)) img.removeAttribute("src");
  });
}

/** Do not warm-buffer huge videos in hidden preload nodes (~50 MB). */
export const TV_PRELOAD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type TvPreloadMedia = {
  url: string;
  type: "image" | "video";
  bytes?: number;
  tooLargeForTv?: boolean;
};

export function videoEligibleForPreload(m: TvPreloadMedia): boolean {
  if (m.type !== "video") return true;
  if (m.tooLargeForTv) return false;
  // Byte cap applies only when size is known (F-1138).
  if (typeof m.bytes !== "number") return true;
  return m.bytes <= TV_PRELOAD_VIDEO_MAX_BYTES;
}

export function filterPreloadMedia<T extends TvPreloadMedia>(media: T[]): T[] {
  return media.filter(videoEligibleForPreload);
}

/**
 * Object URLs owned by the local media cache (lib/tv-media-cache.ts). They
 * back a video for the whole session (loops, remounts), so element release
 * must not revoke them; the cache revokes its own when it prunes.
 */
const persistentObjectUrls = new Set<string>();
export function markPersistentObjectUrl(url: string): void {
  if (url) persistentObjectUrls.add(url);
}
export function unmarkPersistentObjectUrl(url: string): void {
  persistentObjectUrls.delete(url);
}
export function isPersistentObjectUrl(url: string | null | undefined): boolean {
  return Boolean(url && persistentObjectUrls.has(url));
}

export function revokeObjectUrlIfBlob(url: string | null | undefined): void {
  if (!url?.startsWith("blob:")) return;
  if (persistentObjectUrls.has(url)) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

export function releaseVideoElement(
  video: HTMLVideoElement | null | undefined
): void {
  if (!video) return;
  try {
    video.pause();
    const src = video.currentSrc || video.getAttribute("src") || "";
    video.removeAttribute("src");
    video.load();
    revokeObjectUrlIfBlob(src);
  } catch {
    /* ignore */
  }
}

export class TvWarmMediaRegistry {
  private order: string[] = [];

  noteActive(urls: Iterable<string>): string[] {
    const keep = new Set<string>();
    for (const raw of urls) {
      const url = raw?.trim();
      if (url) keep.add(url);
    }
    const released: string[] = [];
    for (const u of this.order) {
      if (!keep.has(u)) released.push(u);
    }
    this.order = this.order.filter((u) => keep.has(u));
    for (const u of keep) {
      if (!this.order.includes(u)) this.order.push(u);
    }
    while (this.order.length > TV_WARM_MEDIA_CAP) {
      released.push(this.order.shift()!);
    }
    return released;
  }

  releaseAll(): string[] {
    const out = [...this.order];
    this.order = [];
    return out;
  }

  /** Active warm URLs — for memory smoke only. */
  activeCount(): number {
    return this.order.length;
  }
}

/** Shared warm-media registry for slide preloads (page + nightly cleanup). */
export const tvWarmMediaRegistry = new TvWarmMediaRegistry();

/** Simulated slide/preload churn for smoke (registry cap proxy). */
export function simulateTvMediaSlideCycles(
  cycles: number,
  registry = new TvWarmMediaRegistry()
): { peakActive: number; releasedTotal: number } {
  let releasedTotal = 0;
  let peakActive = 0;
  const pool = Array.from({ length: 12 }, (_, i) => `https://cdn.example/media-${i}.mp4`);
  for (let c = 0; c < cycles; c++) {
    releasedTotal += registry
      .noteActive([
        pool[c % pool.length]!,
        pool[(c + 1) % pool.length]!,
        pool[(c + 3) % pool.length]!,
      ])
      .length;
    peakActive = Math.max(peakActive, registry.activeCount());
  }
  return { peakActive, releasedTotal };
}

export function tvMemorySimulationFlat(cycles: number): boolean {
  const { peakActive } = simulateTvMediaSlideCycles(cycles);
  return peakActive <= TV_WARM_MEDIA_CAP;
}
