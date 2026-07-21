"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

/** One arrangeable rotation block (mirrors a TV slide key). */
export type Block = {
  key: string;
  title: string;
  kind: "Slide" | "Guide" | "Feed" | "Page";
};

/** Draggable media-pool entry (Drive folder, Blob, listing photos). */
export type MediaAsset = { url: string; type: "image" | "video" };

type Item = {
  key: string;
  seconds: number | "";
  transition: string;
  daypart: string;
  url?: string;
  mediaType?: "image" | "video";
};

const TRANSITIONS = [
  { value: "fade", label: "Fade" },
  { value: "glide", label: "Glide" },
  { value: "zoom", label: "Zoom" },
  { value: "none", label: "Cut" },
];

const DAYPARTS = [
  { value: "", label: "All day" },
  { value: "morning", label: "Mornings (5a–12p)" },
  { value: "afternoon", label: "Afternoons (12–5p)" },
  { value: "evening", label: "Evenings (5p on)" },
];

const KIND_TAG: Record<string, string> = {
  Slide: "bg-ocean-500 text-white",
  Guide: "bg-sand-300 text-ocean-900",
  Feed: "bg-seafoam-500 text-white",
  Page: "bg-ocean-700 text-white",
  Media: "bg-ocean-900 text-white",
};

/** Stable key for a media URL (djb2 hex) — dedupes and survives reloads. */
function mediaKey(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return `media-${(h >>> 0).toString(16)}`;
}

/** Smaller rendition for grid thumbnails where the CDN supports it. */
function thumbUrl(url: string): string {
  return url.includes("googleusercontent.com")
    ? url.replace(/=w\d+$/, "=w480")
    : url;
}

/** Where a media asset lives — badge so same-looking photos from two
 *  sources (Drive upload vs Guesty listing) are explainable at a glance. */
function mediaSource(url: string): string {
  if (url.includes("googleusercontent.com") || url.includes("drive.google.com"))
    return "Drive";
  if (url.includes("blob.vercel-storage.com")) return "Blob";
  if (url.includes("guesty")) return "Listing";
  return "Web";
}

/** Drive file id from either the download or googleusercontent URL shape. */
function driveId(url: string): string | null {
  const m = url.match(/[?&]id=([\w-]+)/) ?? url.match(/\/d\/([\w-]+)/);
  return m?.[1] ?? null;
}

/** Poster for a video tile: Drive files get Drive's real thumbnail
 *  endpoint (raw <video> frames don't load from the download URL); other
 *  hosts fall back to a first-frame <video preload="metadata">. */
function videoPoster(url: string): string | null {
  const id = driveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w480` : null;
}

function mediaTitle(url: string, type: "image" | "video"): string {
  try {
    const base = decodeURIComponent(
      new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    ).replace(/\.[a-z0-9]{2,5}$/i, "");
    if (base && base.length <= 28 && !/^[A-Za-z0-9_-]{20,}$/.test(base))
      return base;
  } catch {
    // fall through to the generic label
  }
  return type === "video" ? "Video" : "Photo";
}

function MediaThumb({
  url,
  type,
  width,
  className,
}: {
  url: string;
  type: "image" | "video";
  width: number;
  className: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-ocean-900 ${className}`}
      style={{ width, height: Math.round((width * 1080) / 1920) }}
    >
      {type === "video" ? (
        videoPoster(url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={videoPoster(url)!}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={url}
            muted
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl(url)} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}
      {type === "video" && (
        <span className="absolute bottom-1 right-1 rounded bg-ocean-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
          ▶ video
        </span>
      )}
    </div>
  );
}

/** Drop-preview ghost: a dashed tile showing exactly where the dragged
 *  media lands on release, with its own thumbnail at reduced opacity. */
function DropGhost({ asset, tile }: { asset: MediaAsset; tile: number }) {
  return (
    <li
      aria-hidden
      className="pointer-events-none shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-seafoam-500 bg-seafoam-500/10"
      style={{ width: tile }}
    >
      <div className="opacity-60">
        <MediaThumb url={asset.url} type={asset.type} width={tile} className="rounded-t-[10px]" />
      </div>
      <p className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-seafoam-500">
        Drop here
      </p>
    </li>
  );
}

/** Live miniature of a real TV slide (see v2a) — sized by the tile slider. */
function SlideThumb({
  blockKey,
  propertyId,
  width,
}: {
  blockKey: string;
  propertyId: string;
  width: number;
}) {
  return (
    <div
      className="pointer-events-none relative overflow-hidden rounded-t-[11px] bg-ocean-900"
      style={{ width, height: Math.round((width * 1080) / 1920) }}
    >
      <iframe
        src={`/tv?property=${propertyId}&slide=${encodeURIComponent(blockKey)}`}
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        scrolling="no"
        className="absolute left-0 top-0 h-[1080px] w-[1920px] origin-top-left border-0"
        style={{ transform: `scale(${width / 1920})` }}
      />
    </div>
  );
}

/** Slim publish-history summary (S0.4) — restore round-trips via the API. */
export type HistoryEntry = { at: string; blocks: number; media: number };

export default function SignageEditor({
  propertyId,
  blocks,
  media,
  initial,
  history,
  defaultSeconds,
}: {
  propertyId: string;
  blocks: Block[];
  media: MediaAsset[];
  history: HistoryEntry[];
  initial: {
    items: {
      key: string;
      seconds?: number;
      transition?: string;
      daypart?: string;
      url?: string;
      mediaType?: "image" | "video";
    }[];
    photos: boolean;
  } | null;
  defaultSeconds: number;
}) {
  const byKey = useMemo(() => new Map(blocks.map((b) => [b.key, b])), [blocks]);
  const [items, setItems] = useState<Item[]>(() => {
    const source =
      initial?.items?.filter((it) => byKey.has(it.key) || it.url) ??
      blocks.map((b) => ({
        key: b.key,
        seconds: undefined,
        transition: undefined,
        daypart: undefined,
      }));
    return source.map((it) => ({
      key: it.key,
      seconds: it.seconds ?? "",
      transition: it.transition ?? "fade",
      daypart: it.daypart ?? "",
      ...("url" in it && it.url
        ? { url: it.url, mediaType: it.mediaType }
        : null),
    }));
  });
  const [photos, setPhotos] = useState(initial ? initial.photos : true);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<
    { ok: boolean; text: string } | null
  >(null);

  // Tile scale (host 2026-07-17): one slider sizes every card; sticky.
  const [tile, setTile] = useState(176);
  useEffect(() => {
    const saved = Number(localStorage.getItem("fh_signage_tile"));
    if (saved >= 130 && saved <= 360) setTile(saved);
  }, []);
  function rescale(v: number) {
    setTile(v);
    try {
      localStorage.setItem("fh_signage_tile", String(v));
    } catch {
      // best-effort persistence
    }
  }

  const tray = blocks.filter((b) => !items.some((it) => it.key === b.key));
  const library = media.filter(
    (m) => !items.some((it) => it.url === m.url)
  );

  /* ── Drag state: reordering timeline cards, or dragging in media.
     State (not refs) so the strip re-renders ghosts live: the dragged
     card dims and restacks in place; a media drag shows a dashed
     drop-preview tile exactly where release would insert it. ──────── */
  const [drag, setDrag] = useState<
    | { kind: "reorder"; key: string }
    | { kind: "media"; asset: MediaAsset }
    | null
  >(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  function endDrag() {
    setDrag(null);
    setDropAt(null);
  }

  function dragOver(overKey: string, overIndex: number) {
    if (!drag) return;
    if (drag.kind === "media") {
      setDropAt(overIndex);
      return;
    }
    const from = items.findIndex((it) => it.key === drag.key);
    const to = items.findIndex((it) => it.key === overKey);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDirty(true);
  }
  function insertMedia(asset: MediaAsset, at: number) {
    const item: Item = {
      key: mediaKey(asset.url),
      seconds: "",
      transition: "fade",
      daypart: "",
      url: asset.url,
      mediaType: asset.type,
    };
    if (items.some((it) => it.key === item.key)) return; // already placed
    const next = [...items];
    next.splice(at < 0 ? next.length : at, 0, item);
    setItems(next);
    setDirty(true);
  }
  function move(key: string, dir: -1 | 1) {
    const at = items.findIndex((it) => it.key === key);
    const to = at + dir;
    if (at === -1 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[at], next[to]] = [next[to], next[at]];
    setItems(next);
    setDirty(true);
  }
  function remove(key: string) {
    setItems(items.filter((it) => it.key !== key));
    setDirty(true);
  }
  function add(key: string) {
    setItems([...items, { key, seconds: "", transition: "fade", daypart: "" }]);
    setDirty(true);
  }
  function shuffle() {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setItems(next);
    setDirty(true);
  }
  function patch(key: string, p: Partial<Item>) {
    setItems(items.map((it) => (it.key === key ? { ...it, ...p } : it)));
    setDirty(true);
  }
  function setSeconds(key: string, raw: string) {
    const v = raw === "" ? "" : Math.max(0, Math.round(Number(raw)));
    patch(key, { seconds: v === 0 ? "" : (v as number | "") });
  }

  const loopSeconds = items.reduce(
    (sum, it) =>
      sum +
      (typeof it.seconds === "number"
        ? it.seconds
        : it.mediaType === "video"
          ? 60 // play-to-end estimate
          : defaultSeconds),
    0
  );

  const payload = {
    items: items.map((it) => ({
      key: it.key,
      ...(typeof it.seconds === "number" ? { seconds: it.seconds } : null),
      ...(it.transition !== "fade" ? { transition: it.transition } : null),
      ...(it.daypart ? { daypart: it.daypart } : null),
      ...(it.url ? { url: it.url, mediaType: it.mediaType } : null),
    })),
    photos,
  };

  // Plain API call, not a server action: action ids go stale when a deploy
  // lands mid-session (frequent here) and publishes dropped silently.
  async function publish(reset: boolean) {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const res = await fetch("/api/host/signage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          reset ? { propertyId, reset: true } : { propertyId, playlist: payload }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setPublishMsg({
          ok: false,
          text: `Publish failed: ${data.error ?? res.status}. Nothing changed on the TVs.`,
        });
      } else {
        setDirty(false);
        setPublishMsg({
          ok: true,
          text: reset
            ? "Reset to the default rotation — TVs update in ~10 seconds."
            : "Published — TVs update in ~10 seconds.",
        });
      }
    } catch {
      setPublishMsg({
        ok: false,
        text: "Publish failed: network error. Nothing changed on the TVs.",
      });
    } finally {
      setPublishing(false);
    }
  }

  // S0.4 one-click rollback. On success the page reloads so the editor
  // re-seeds from the restored playlist (and the history gains the restore).
  async function restore(at: string) {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const res = await fetch("/api/host/signage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId, restoreAt: at }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setPublishMsg({
          ok: false,
          text: `Restore failed: ${data.error ?? res.status}. Nothing changed on the TVs.`,
        });
        setPublishing(false);
        return;
      }
      location.reload();
    } catch {
      setPublishMsg({
        ok: false,
        text: "Restore failed: network error. Nothing changed on the TVs.",
      });
      setPublishing(false);
    }
  }

  return (
    <section className="mt-6">
      {/* ── Timeline ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <h2 className="font-semibold text-ocean-700">Timeline</h2>
          <label className="flex items-center gap-2 text-sm text-ocean-900/60">
            Tile size
            <input
              type="range"
              min={130}
              max={360}
              step={10}
              value={tile}
              onChange={(e) => rescale(Number(e.target.value))}
              className="w-40 accent-ocean-500"
            />
          </label>
          <button
            type="button"
            onClick={shuffle}
            disabled={items.length < 2}
            className="rounded-full border border-sand-300 px-3 py-1 text-sm font-semibold text-ocean-700 transition hover:border-ocean-500 hover:bg-ocean-50 disabled:opacity-30"
            title="Randomize the slide order"
          >
            🔀 Shuffle
          </button>
          <p className="text-sm text-ocean-900/50">
            {items.length} block{items.length === 1 ? "" : "s"} · full loop ≈{" "}
            {Math.round(loopSeconds / 60)}m {loopSeconds % 60}s
          </p>
        </div>

        {items.length === 0 && (
          <p className="mt-4 rounded-xl bg-sand-100 p-4 text-ocean-900/60">
            The timeline is empty — add blocks from the tray or drag media in
            from the library below. Publishing needs at least one block.
          </p>
        )}

        <ol
          className="mt-3 flex gap-3 overflow-x-auto pb-2"
          onDragOver={(e) => {
            if (drag?.kind !== "media") return;
            e.preventDefault();
            // Over the open strip (not a card): preview an append.
            if (e.target === e.currentTarget) setDropAt(items.length);
          }}
          onDrop={(e) => {
            if (drag?.kind !== "media") return;
            e.preventDefault();
            insertMedia(drag.asset, dropAt ?? -1);
            endDrag();
          }}
        >
          {items.map((it, i) => {
            const b = byKey.get(it.key);
            const isMedia = Boolean(it.url && it.mediaType);
            if (!b && !isMedia) return null;
            const kind = isMedia ? "Media" : b!.kind;
            const title = isMedia
              ? mediaTitle(it.url!, it.mediaType!)
              : b!.title;
            const dimmed = drag?.kind === "reorder" && drag.key === it.key;
            return (
              <Fragment key={it.key}>
                {drag?.kind === "media" && dropAt === i && (
                  <DropGhost asset={drag.asset} tile={tile} />
                )}
              <li
                draggable
                onDragStart={() => setDrag({ kind: "reorder", key: it.key })}
                onDragEnd={endDrag}
                onDragOver={(e) => {
                  e.preventDefault();
                  dragOver(it.key, i);
                }}
                onDrop={(e) => {
                  if (drag?.kind !== "media") return;
                  e.preventDefault();
                  e.stopPropagation();
                  insertMedia(drag.asset, dropAt ?? i);
                  endDrag();
                }}
                className={`shrink-0 cursor-grab rounded-xl border bg-white shadow-sm transition hover:border-ocean-500 active:cursor-grabbing ${
                  dimmed
                    ? "border-seafoam-500 opacity-40 ring-2 ring-seafoam-500"
                    : "border-sand-300"
                }`}
                style={{ width: tile }}
              >
                {isMedia ? (
                  <MediaThumb
                    url={it.url!}
                    type={it.mediaType!}
                    width={tile}
                    className="rounded-t-[11px]"
                  />
                ) : (
                  <SlideThumb
                    blockKey={it.key}
                    propertyId={propertyId}
                    width={tile}
                  />
                )}
                <div
                  className={`flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${KIND_TAG[kind]}`}
                >
                  {kind}
                  <span className="font-mono font-normal normal-case opacity-70">
                    #{i + 1}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="min-h-10 text-sm font-semibold leading-snug text-ocean-900">
                    {title}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-sm text-ocean-900/60">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={it.seconds}
                      placeholder={
                        it.mediaType === "video" ? "end" : String(defaultSeconds)
                      }
                      onChange={(e) => setSeconds(it.key, e.target.value)}
                      className="w-14 rounded-lg border border-sand-300 p-1 text-center outline-none focus:border-ocean-500"
                      aria-label={`${title} seconds`}
                      title={
                        it.mediaType === "video"
                          ? "Blank = play to the end"
                          : "Blank = property default"
                      }
                    />
                    <span>sec</span>
                    <select
                      value={it.transition}
                      onChange={(e) => patch(it.key, { transition: e.target.value })}
                      className="ml-auto rounded-lg border border-sand-300 bg-white p-1 text-xs outline-none focus:border-ocean-500"
                      aria-label={`${title} transition`}
                      title="Entrance transition"
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={it.daypart}
                    onChange={(e) => patch(it.key, { daypart: e.target.value })}
                    className={`mt-1 w-full rounded-lg border border-sand-300 bg-white p-1 text-xs outline-none focus:border-ocean-500 ${
                      it.daypart ? "text-ocean-700" : "text-ocean-900/50"
                    }`}
                    aria-label={`${title} schedule`}
                    title="When this block plays"
                  >
                    {DAYPARTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex items-center justify-between text-ocean-900/40">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(it.key, -1)}
                        disabled={i === 0}
                        className="rounded px-1.5 py-0.5 hover:bg-ocean-50 hover:text-ocean-700 disabled:opacity-30"
                        aria-label={`Move ${title} earlier`}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(it.key, 1)}
                        disabled={i === items.length - 1}
                        className="rounded px-1.5 py-0.5 hover:bg-ocean-50 hover:text-ocean-700 disabled:opacity-30"
                        aria-label={`Move ${title} later`}
                      >
                        ▶
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(it.key)}
                      className="rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${title}`}
                      title={
                        isMedia
                          ? "Remove from timeline (stays in the library)"
                          : "Park this block (stays reachable from the TV menu)"
                      }
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
              </Fragment>
            );
          })}
          {drag?.kind === "media" && dropAt === items.length && (
            <DropGhost asset={drag.asset} tile={tile} />
          )}
        </ol>

        <label className="mt-3 flex items-center gap-2 text-sm text-ocean-900/70">
          <input
            type="checkbox"
            checked={photos}
            onChange={(e) => {
              setPhotos(e.target.checked);
              setDirty(true);
            }}
            className="h-4 w-4 accent-ocean-500"
          />
          Weave property photos between blocks (every third slide)
        </label>
      </div>

      {/* ── Media library ─────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-md">
        <h2 className="font-semibold text-ocean-700">Media library</h2>
        <p className="mt-1 text-sm text-ocean-900/50">
          Everything in the Drive media folder, Blob storage, and the
          listing&apos;s photos. Drag a tile anywhere into the timeline (or
          click it) to make it a full-screen block — videos play to the end
          unless you set seconds.
        </p>
        {library.length === 0 ? (
          <p className="mt-3 text-sm text-ocean-900/40">
            {media.length === 0
              ? "No media yet — drop files into the Drive folder and they appear here within a minute."
              : "All media is on the timeline."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-3">
            {library.map((m) => (
              <li key={m.url}>
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDrag({ kind: "media", asset: m })}
                  onDragEnd={endDrag}
                  onClick={() => insertMedia(m, -1)}
                  title="Drag into the timeline, or click to add at the end"
                  className="group block cursor-grab overflow-hidden rounded-xl border border-sand-300 text-left shadow-sm transition hover:border-ocean-500 active:cursor-grabbing"
                  style={{ width: Math.round(tile * 0.75) }}
                >
                  <MediaThumb
                    url={m.url}
                    type={m.type}
                    width={Math.round(tile * 0.75)}
                    className="rounded-t-[11px]"
                  />
                  <span
                    className="block px-2 py-1 text-xs font-semibold text-ocean-900/70 group-hover:text-ocean-700"
                    style={{ width: Math.round(tile * 0.75) }}
                  >
                    <span className="mr-1 rounded bg-sand-100 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ocean-900/50">
                      {mediaSource(m.url)}
                    </span>
                    {mediaTitle(m.url, m.type)}
                    <span className="float-right text-ocean-500 opacity-0 transition group-hover:opacity-100">
                      + add
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Parked blocks ─────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-md">
        <h2 className="font-semibold text-ocean-700">Parked blocks</h2>
        <p className="mt-1 text-sm text-ocean-900/50">
          Not in the loop, but guests can still reach them from the TV menu.
          Farewell and launch-day slides always play on their day — they
          aren&apos;t listed here.
        </p>
        {tray.length === 0 ? (
          <p className="mt-3 text-sm text-ocean-900/40">
            Everything is on the timeline.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tray.map((b) => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => add(b.key)}
                  className="group flex items-center gap-2 rounded-xl border border-dashed border-sand-300 px-3 py-2 text-sm font-semibold text-ocean-900/70 transition hover:border-ocean-500 hover:text-ocean-700"
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${KIND_TAG[b.kind]}`}
                  >
                    {b.kind}
                  </span>
                  {b.title}
                  <span className="text-ocean-500 opacity-0 transition group-hover:opacity-100">
                    + add
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Publish ───────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void publish(false)}
          disabled={items.length === 0 || publishing}
          className="rounded-full bg-ocean-500 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-ocean-700 disabled:opacity-40"
        >
          {publishing ? "Publishing…" : "Publish to TVs"}
        </button>
        <button
          type="button"
          onClick={() => void publish(true)}
          disabled={publishing}
          className="rounded-full border border-sand-300 px-5 py-2.5 font-semibold text-ocean-900/60 transition hover:bg-sand-100 hover:text-ocean-700 disabled:opacity-40"
        >
          Reset to default rotation
        </button>
        {publishMsg ? (
          <p
            className={`text-sm font-semibold ${
              publishMsg.ok ? "text-seafoam-500" : "text-red-600"
            }`}
          >
            {publishMsg.text}
          </p>
        ) : dirty ? (
          <p className="text-sm font-semibold text-ocean-900/50">
            Unpublished changes
          </p>
        ) : null}
      </div>

      {/* ── Publish history (S0.4) ────────────────────────────────── */}
      {history.length > 0 && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-md">
          <h2 className="font-semibold text-ocean-700">Publish history</h2>
          <p className="mt-1 text-sm text-ocean-900/50">
            The last {history.length === 1 ? "publish" : `${history.length} publishes`} for
            this property. Restore puts that arrangement back on the TVs in
            one click — the restore itself joins the history, so it&apos;s
            undoable too.
          </p>
          <ul className="mt-3 divide-y divide-sand-100">
            {history.map((h, i) => (
              <li
                key={h.at}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
              >
                <span className="min-w-44 text-sm font-semibold text-ocean-900">
                  {new Date(h.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-sm text-ocean-900/60">
                  {h.blocks} block{h.blocks === 1 ? "" : "s"}
                  {h.media > 0 &&
                    ` · ${h.media} media slide${h.media === 1 ? "" : "s"}`}
                </span>
                {/* newest is restorable too — after a Reset it isn't live */}
                {i === 0 && (
                  <span className="rounded-full bg-seafoam-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-seafoam-500">
                    Latest
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void restore(h.at)}
                  disabled={publishing}
                  className="ml-auto rounded-full border border-sand-300 px-4 py-1 text-sm font-semibold text-ocean-700 transition hover:border-ocean-500 hover:bg-ocean-50 disabled:opacity-40"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
