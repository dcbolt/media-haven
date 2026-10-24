/** Host/TV playlist sanitizer — shared by tv.ts and publish prepare (Node-safe). */

export const SLIDE_TRANSITIONS = ["fade", "glide", "zoom", "none"] as const;
export const SLIDE_DAYPARTS = ["morning", "afternoon", "evening"] as const;

export type SignagePlaylist = {
  items: Array<{
    key: string;
    seconds?: number;
    transition?: (typeof SLIDE_TRANSITIONS)[number];
    daypart?: (typeof SLIDE_DAYPARTS)[number];
    url?: string;
    mediaType?: "image" | "video";
  }>;
  photos: boolean;
};

/** Sanitize settings.playlist (host-authored JSON). */
export function signagePlaylist(raw: unknown): SignagePlaylist | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { items?: unknown; photos?: unknown };
  if (!Array.isArray(o.items)) return null;
  const seen = new Set<string>();
  const items: SignagePlaylist["items"] = [];
  for (const it of o.items.slice(0, 40)) {
    if (!it || typeof it !== "object") continue;
    const key = String((it as { key?: unknown }).key ?? "")
      .trim()
      .slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const s = Number((it as { seconds?: unknown }).seconds);
    const t = String((it as { transition?: unknown }).transition ?? "");
    const item: SignagePlaylist["items"][number] = { key };
    if (Number.isFinite(s) && s > 0)
      item.seconds = Math.min(120, Math.max(5, Math.round(s)));
    if ((SLIDE_TRANSITIONS as readonly string[]).includes(t) && t !== "fade")
      item.transition = t as (typeof SLIDE_TRANSITIONS)[number];
    const d = String((it as { daypart?: unknown }).daypart ?? "");
    if ((SLIDE_DAYPARTS as readonly string[]).includes(d))
      item.daypart = d as (typeof SLIDE_DAYPARTS)[number];
    const url = String((it as { url?: unknown }).url ?? "");
    const mt = String((it as { mediaType?: unknown }).mediaType ?? "");
    if (
      /^https:\/\/\S{5,600}$/.test(url) &&
      (mt === "image" || mt === "video")
    ) {
      item.url = url;
      item.mediaType = mt;
    }
    items.push(item);
  }
  if (items.length === 0) return null;
  return { items, photos: o.photos !== false };
}
