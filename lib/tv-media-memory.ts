/** Cap warmed slide / standby media so long-run TVs do not hoard decoders. */

export const TV_WARM_MEDIA_CAP = 4;

export function revokeObjectUrlIfBlob(url: string | null | undefined): void {
  if (!url?.startsWith("blob:")) return;
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
}
