/**
 * Host media library helpers — source labels, placeholders, filters (pure).
 */

export type MediaSourceKind = "blob" | "drive" | "listing" | "web";

const PLACEHOLDER_HEX = new Set(["7ee72d", "fd0c50"]);

export function mediaSourceKind(url: string): MediaSourceKind {
  const u = url.toLowerCase();
  if (u.includes("blob.vercel-storage.com")) return "blob";
  if (u.includes("googleusercontent.com") || u.includes("drive.google.com")) {
    return "drive";
  }
  if (u.includes("guesty")) return "listing";
  return "web";
}

export function mediaSourceLabel(url: string): string {
  const k = mediaSourceKind(url);
  if (k === "blob") return "BLOB";
  if (k === "drive") return "DRIVE";
  if (k === "listing") return "LISTING";
  return "WEB";
}

/** Solid-color / broken upload tiles (e.g. hex-only "BLOB Photo" titles). */
export function isPlaceholderMedia(
  url: string,
  title?: string | null
): boolean {
  const t = (title ?? "").trim();
  const lower = t.toLowerCase();
  if (/^blob photo$/i.test(t) && mediaSourceKind(url) === "blob") return true;
  const hexTitle = lower.replace(/^blob photo\s*/i, "").trim();
  if (/^[0-9a-f]{6}$/i.test(hexTitle)) return true;
  if (PLACEHOLDER_HEX.has(hexTitle)) return true;
  try {
    const base = decodeURIComponent(
      new URL(url).pathname.split("/").pop() ?? ""
    ).replace(/\.[a-z0-9]+$/i, "");
    if (/^[0-9a-f]{6}$/i.test(base)) return true;
    if (PLACEHOLDER_HEX.has(base.toLowerCase())) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Blob assets can be purged from storage; others are hide-only in catalog. */
export function canPurgeBlobAtSource(url: string): boolean {
  return mediaSourceKind(url) === "blob";
}

export type MediaLibraryFilter =
  | "all"
  | "unused"
  | "placeholder"
  | "blob"
  | "drive"
  | "listing"
  | "web";

export type MediaLibraryItemLike = {
  url: string;
  title?: string | null;
  trashedAt?: string | null;
  hidden?: boolean;
};

export type MediaTrashState = Pick<
  MediaLibraryItemLike,
  "trashedAt" | "hidden"
>;

export function isMediaTrashed(
  entry: MediaTrashState | undefined,
  now = Date.now()
): boolean {
  if (!entry?.trashedAt && !entry?.hidden) return false;
  if (entry.hidden) return true;
  const t = Date.parse(entry.trashedAt ?? "");
  return Number.isFinite(t) && t <= now;
}

export function filterMediaLibrary<T extends MediaLibraryItemLike>(
  items: T[],
  opts: {
    filter: MediaLibraryFilter;
    query: string;
    tagFilter: string | null;
    timelineUrls: Set<string>;
    showTrashed: boolean;
    titleOf: (m: T) => string;
    tagsOf: (m: T) => string[];
  }
): T[] {
  const q = opts.query.trim().toLowerCase();
  return items.filter((m) => {
    const trashed = isMediaTrashed(m);
    if (opts.showTrashed ? !trashed : trashed) return false;
    if (opts.timelineUrls.has(m.url) && opts.filter !== "all" && !opts.showTrashed) {
      /* still show in library grid — timeline filter is separate "unused" */
    }
    if (opts.filter === "unused" && opts.timelineUrls.has(m.url)) return false;
    if (opts.filter === "placeholder" && !isPlaceholderMedia(m.url, m.title)) {
      return false;
    }
    if (opts.filter === "blob" && mediaSourceKind(m.url) !== "blob") return false;
    if (opts.filter === "drive" && mediaSourceKind(m.url) !== "drive") return false;
    if (opts.filter === "listing" && mediaSourceKind(m.url) !== "listing") {
      return false;
    }
    if (opts.filter === "web" && mediaSourceKind(m.url) !== "web") return false;
    if (opts.tagFilter && !opts.tagsOf(m).includes(opts.tagFilter)) return false;
    if (q) {
      const hay = [
        opts.titleOf(m),
        ...opts.tagsOf(m),
        mediaSourceLabel(m.url),
        m.url,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function placeholderUrls<T extends MediaLibraryItemLike>(
  items: T[],
  titleOf: (m: T) => string
): string[] {
  return items
    .filter((m) => isPlaceholderMedia(m.url, m.title ?? titleOf(m)))
    .map((m) => m.url);
}
