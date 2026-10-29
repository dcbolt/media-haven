/**
 * Standby playback plan (Blob transfer leak, 2026-10-29).
 *
 * The default standby clip is a ~105 MB MP4 on Vercel Blob. Before this, the
 * standby <video> was keyed on the *current asset* URL, never looped, and the
 * hidden preloader warmed the same clip again with preload="auto". With the
 * #167 memory guard releasing the element (src removed + load()) on every
 * asset change, each pass of the clip cost a fresh full download, plus one
 * more for the warm copy.
 *
 * Rules:
 * - One distinct asset and it is a video → native `loop`; nothing advances,
 *   nothing remounts, nothing refetches.
 * - Exactly one distinct video in a mixed playlist → that video keeps ONE
 *   mounted element for the whole rotation (hidden + paused while photos
 *   show, rewound and resumed on its turn). Its src never resets between
 *   plays.
 * - Several distinct videos → the element follows the current video (a real
 *   src change), exactly as before.
 * - The #167 memory guard still releases the element, but only when the
 *   persistent video URL really changes (playlist change) or on unmount.
 * - The preloader never warms the video the persistent element already holds.
 */

export type StandbyAsset = {
  url: string;
  type: "image" | "video";
  bytes?: number;
  tooLargeForTv?: boolean;
};

export type StandbyPlaybackPlan<T extends StandbyAsset = StandbyAsset> = {
  /** Asset on screen now (deduped playlist). */
  asset: T | null;
  /** URL held by the single mounted standby <video>, or null for none. */
  videoUrl: string | null;
  /** True when the mounted video is the asset on screen now. */
  videoVisible: boolean;
  /** Native loop: the playlist is exactly one video. */
  loopVideo: boolean;
  /** Next asset worth warming in the hidden preloader (never videoUrl). */
  warmNext: T | null;
  /** Distinct playlist length (drives `advance`). */
  length: number;
};

/** Drop repeated URLs, keeping first-seen order. */
export function dedupeStandbyAssets<T extends StandbyAsset>(assets: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of assets) {
    const url = a?.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(a);
  }
  return out;
}

export function standbyPlaybackPlan<T extends StandbyAsset>(
  assets: T[],
  index: number
): StandbyPlaybackPlan<T> {
  const list = dedupeStandbyAssets(assets);
  const n = list.length;
  if (n === 0) {
    return {
      asset: null,
      videoUrl: null,
      videoVisible: false,
      loopVideo: false,
      warmNext: null,
      length: 0,
    };
  }
  const i = ((index % n) + n) % n;
  const asset = list[i]!;
  const videos = list.filter((a) => a.type === "video");
  const videoUrl =
    videos.length === 1
      ? videos[0]!.url
      : asset.type === "video"
        ? asset.url
        : null;
  const next = n > 1 ? list[(i + 1) % n]! : null;
  const warmNext = next && next.url !== videoUrl ? next : null;
  return {
    asset,
    videoUrl,
    videoVisible: asset.type === "video" && asset.url === videoUrl,
    loopVideo: n === 1 && asset.type === "video",
    warmNext,
    length: n,
  };
}

/**
 * Count full-clip fetches over `plays` advances of a playlist under a plan
 * function. A fetch is: the mounted video taking a new src (mount or src
 * change), or a hidden preloader video with preload="auto". Used by the smoke
 * test and its negative control (legacy behaviour).
 */
export function simulateStandbyFetches(
  plan: (assets: StandbyAsset[], index: number) => {
    videoUrl: string | null;
    loopVideo: boolean;
    warmNext: StandbyAsset | null;
    warmPreload?: "auto" | "metadata" | "none";
    length: number;
    /** Legacy only: element remounts per asset even if URL repeats. */
    remountKey?: string | null;
  },
  assets: StandbyAsset[],
  steps: number
): { videoFetches: number; preloadFetches: number; loops: boolean } {
  let videoFetches = 0;
  let preloadFetches = 0;
  let mountedKey: string | null = null;
  let warmKey: string | null = null;
  let loops = false;
  let index = 0;
  for (let s = 0; s < steps; s++) {
    const p = plan(assets, index);
    const key = p.remountKey !== undefined ? p.remountKey : p.videoUrl;
    if (key && key !== mountedKey) videoFetches += 1;
    mountedKey = key ?? null;
    const w =
      p.warmNext && p.warmNext.type === "video" ? p.warmNext.url : null;
    if (w && w !== warmKey && (p.warmPreload ?? "metadata") === "auto") {
      preloadFetches += 1;
    }
    warmKey = w;
    if (p.loopVideo) {
      loops = true;
      continue; // native loop: no advance, element and buffer stay put
    }
    if (p.length > 1) index += 1;
  }
  return { videoFetches, preloadFetches, loops };
}
