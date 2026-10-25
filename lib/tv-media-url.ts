/** Resolve media URLs for stable preload / release comparisons (F-1145). */

export function resolveTvMediaUrl(
  url: string | null | undefined,
  baseHref?: string
): string {
  const raw = url?.trim();
  if (!raw) return "";
  try {
    if (typeof URL !== "undefined" && typeof URL.canParse === "function") {
      if (!URL.canParse(raw, baseHref)) return raw;
      return new URL(raw, baseHref).href;
    }
    if (typeof URL !== "undefined") {
      return new URL(raw, baseHref ?? "https://tv.local/tv").href;
    }
  } catch {
    return raw;
  }
  return raw;
}

export function tvMediaUrlSet(
  urls: Iterable<string>,
  baseHref?: string
): Set<string> {
  const out = new Set<string>();
  for (const u of urls) {
    const resolved = resolveTvMediaUrl(u, baseHref);
    if (resolved) out.add(resolved);
  }
  return out;
}
