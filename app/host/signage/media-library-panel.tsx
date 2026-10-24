"use client";

import { useMemo, useState, type ComponentType } from "react";
import { formatMediaUsageRef, type MediaUsageRef } from "@/lib/media-usage";
import {
  filterMediaLibrary,
  isPlaceholderMedia,
  mediaSourceLabel,
  placeholderUrls,
  type MediaLibraryFilter,
} from "@/lib/media-library";
import MediaLightbox from "@/app/host/media/media-lightbox";
import type { MediaAsset } from "./editor";

function mediaTitle(url: string, type: "image" | "video", override?: string): string {
  if (override?.trim()) return override.trim().slice(0, 40);
  try {
    const base = decodeURIComponent(
      new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
    ).replace(/\.[a-z0-9]{2,5}$/i, "");
    if (base && base.length <= 28 && !/^[A-Za-z0-9_-]{20,}$/.test(base)) return base;
  } catch {
    /* ignore */
  }
  return type === "video" ? "Video" : "Photo";
}

type Props = {
  pool: MediaAsset[];
  timelineUrls: Set<string>;
  usageByUrl: Record<string, MediaUsageRef[]>;
  knownTags: string[];
  tile: number;
  fileHover: boolean;
  onFileHover: (v: boolean) => void;
  onDropFiles: (files: FileList) => void;
  onUploadClick: () => void;
  onCheckHealth: () => void;
  healthState: string;
  healthBroken?: Set<string>;
  uploads: { name: string; status: string; note?: string }[];
  onInsertMedia: (m: MediaAsset) => void;
  onDragStart: (m: MediaAsset) => void;
  onDragEnd: () => void;
  dragActive: boolean;
  MediaThumb: ComponentType<{
    url: string;
    type: "image" | "video";
    width: number;
    className: string;
  }>;
  isExpired: (expiresAt?: string | null) => boolean;
  metaLocal: Record<string, Partial<MediaAsset>>;
  onEditMeta: (m: MediaAsset) => void;
  onPoolRefresh: () => void;
  /** Host /media page: single-click opens full-size preview instead of timeline insert. */
  previewOnClick?: boolean;
  showUpload?: boolean;
};

export default function MediaLibraryPanel({
  pool,
  timelineUrls,
  usageByUrl,
  knownTags,
  tile,
  fileHover,
  onFileHover,
  onDropFiles,
  onUploadClick,
  onCheckHealth,
  healthState,
  healthBroken,
  uploads,
  onInsertMedia,
  onDragStart,
  onDragEnd,
  dragActive,
  MediaThumb,
  isExpired,
  metaLocal,
  onEditMeta,
  onPoolRefresh,
  previewOnClick = false,
  showUpload = true,
}: Props) {
  const [mediaQuery, setMediaQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<MediaLibraryFilter>("all");
  const [showTrash, setShowTrash] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [previewMedia, setPreviewMedia] = useState<MediaAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUsed, setConfirmUsed] = useState<{
    urls: string[];
    refs: MediaUsageRef[];
  } | null>(null);

  const enriched = useMemo(
    () =>
      pool.map((m) => ({
        ...m,
        ...(metaLocal[m.url] ?? null),
      })),
    [pool, metaLocal]
  );

  const notOnTimeline = enriched.filter((m) => !timelineUrls.has(m.url));
  const filtered = filterMediaLibrary(notOnTimeline, {
    filter: libraryFilter,
    query: mediaQuery,
    tagFilter,
    timelineUrls,
    showTrashed: showTrash,
    titleOf: (m) => mediaTitle(m.url, m.type, m.title),
    tagsOf: (m) => m.tags ?? [],
  }).filter((m) => {
    const expired = isExpired(m.expiresAt);
    if (expired && !showExpired && !showTrash) return false;
    return true;
  });

  const chipTags = useMemo(() => {
    const set = new Set(knownTags);
    for (const m of enriched) for (const t of m.tags ?? []) set.add(t);
    return [...set].sort();
  }, [knownTags, enriched]);

  const expiredCount = enriched.filter((m) => isExpired(m.expiresAt)).length;
  const trashedCount = enriched.filter((m) => m.trashedAt || m.hidden).length;

  function toggleSelect(url: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((m) => m.url)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function removeUrls(urls: string[], removeFromTimelines: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/host/media/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          urls,
          removeFromTimelines,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        used?: { url: string; refs: MediaUsageRef[] }[];
      };
      if (res.status === 409 && data.error === "used_in_playlist") {
        const refs = (data.used ?? []).flatMap((u) => u.refs);
        setConfirmUsed({ urls, refs });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      clearSelection();
      setConfirmUsed(null);
      onPoolRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function cleanupAllPlaceholders() {
    const urls = placeholderUrls(enriched, (m) =>
      mediaTitle(m.url, m.type, m.title)
    );
    if (urls.length === 0) return;
    const refs = urls.flatMap((u) => usageByUrl[u] ?? []);
    if (refs.length > 0) {
      setConfirmUsed({ urls, refs });
      return;
    }
    await removeUrls(urls, false);
  }

  async function restoreUrls(urls: string[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/host/media/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", urls }),
      });
      if (!res.ok) throw new Error(String(res.status));
      clearSelection();
      onPoolRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`mt-4 rounded-2xl bg-white p-4 shadow-md transition ${
        fileHover ? "ring-2 ring-seafoam-500" : ""
      }`}
      onDragOver={(e) => {
        if (dragActive || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        onFileHover(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        onFileHover(false);
      }}
      onDrop={(e) => {
        if (dragActive || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        onFileHover(false);
        onDropFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-ocean-700">
          {showTrash ? "Trash" : "Media library"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowTrash((t) => !t);
              clearSelection();
            }}
            className="rounded-full border border-sand-300 px-3 py-1.5 text-sm font-semibold text-ocean-700 hover:bg-sand-50"
          >
            {showTrash ? "← Library" : `Trash (${trashedCount})`}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectMode((m) => !m);
              clearSelection();
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              selectMode
                ? "bg-ocean-500 text-white"
                : "border border-sand-300 text-ocean-700 hover:bg-sand-50"
            }`}
          >
            Select
          </button>
          <button
            type="button"
            onClick={onCheckHealth}
            disabled={healthState === "checking"}
            className="rounded-full border border-sand-300 px-3 py-1.5 text-sm font-semibold text-ocean-700 hover:bg-ocean-50 disabled:opacity-40"
          >
            {healthState === "checking" ? "Checking…" : "✓ Check media"}
          </button>
          {!showTrash && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void cleanupAllPlaceholders()}
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
            >
              Clean up placeholders
            </button>
          )}
          {showUpload && (
            <button
              type="button"
              onClick={onUploadClick}
              className="rounded-full bg-ocean-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-ocean-700"
            >
              ⬆ Upload media
            </button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sand-50 p-2 text-sm">
          <span className="font-semibold text-ocean-900/70">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={selectAllFiltered}
            className="rounded-full bg-white px-3 py-1 font-semibold text-ocean-700 ring-1 ring-sand-200"
          >
            Select all filtered ({filtered.length})
          </button>
          {!showTrash ? (
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void removeUrls([...selected], false)}
              className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white disabled:opacity-40"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void restoreUrls([...selected])}
              className="rounded-full bg-seafoam-600 px-3 py-1 font-semibold text-white disabled:opacity-40"
            >
              Restore
            </button>
          )}
          <button type="button" onClick={clearSelection} className="text-ocean-500">
            Clear
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={mediaQuery}
          onChange={(e) => setMediaQuery(e.target.value)}
          placeholder="Search title, tags, source…"
          className="w-full rounded-full border border-sand-300 bg-sand-50 px-4 py-2 text-sm sm:max-w-xs"
        />
        <select
          value={libraryFilter}
          onChange={(e) => setLibraryFilter(e.target.value as MediaLibraryFilter)}
          className="rounded-full border border-sand-300 bg-white px-3 py-2 text-sm font-semibold text-ocean-700"
        >
          <option value="all">All sources</option>
          <option value="unused">Unused on timeline</option>
          <option value="placeholder">Placeholders</option>
          <option value="blob">BLOB</option>
          <option value="drive">DRIVE</option>
          <option value="listing">LISTING</option>
          <option value="web">WEB</option>
        </select>
        {expiredCount > 0 && !showTrash && (
          <label className="flex items-center gap-2 text-sm text-ocean-900/70">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
            />
            Show expired ({expiredCount})
          </label>
        )}
      </div>

      {chipTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              !tagFilter ? "bg-ocean-500 text-white" : "bg-sand-100 text-ocean-900/60"
            }`}
          >
            All tags
          </button>
          {chipTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTagFilter((c) => (c === t ? null : t))}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                tagFilter === t ? "bg-ocean-500 text-white" : "bg-sand-100 text-ocean-900/60"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mt-3 space-y-1">
          {uploads.map((u) => (
            <li key={u.name} className="rounded-lg bg-sand-100 px-3 py-1.5 text-sm">
              {u.name} — {u.status}
            </li>
          ))}
        </ul>
      )}

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-ocean-900/40">
          {showTrash ? "Trash is empty." : "No media matches this view."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-3">
          {filtered.map((m) => {
            const expired = isExpired(m.expiresAt);
            const checked = selected.has(m.url);
            return (
              <li key={m.url} className="relative">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(m.url)}
                    className="absolute left-2 top-2 z-20 h-4 w-4 accent-ocean-500"
                  />
                )}
                <button
                  type="button"
                  draggable={!expired && !selectMode && !showTrash}
                  onDragStart={() => !selectMode && onDragStart(m)}
                  onDragEnd={onDragEnd}
                  onClick={() => {
                    if (selectMode) toggleSelect(m.url);
                    else if (previewOnClick) setPreviewMedia(m);
                    else if (!expired && !showTrash) onInsertMedia(m);
                    else setPreviewMedia(m);
                  }}
                  className={`group block overflow-hidden rounded-xl border text-left shadow-sm ${
                    expired ? "opacity-50" : "hover:border-ocean-500"
                  } ${checked ? "ring-2 ring-ocean-400" : "border-sand-300"}`}
                  style={{ width: Math.round(tile * 0.75) }}
                >
                  {healthBroken?.has(m.url) && (
                    <span className="absolute left-1 top-1 z-10 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      broken
                    </span>
                  )}
                  <MediaThumb
                    url={m.url}
                    type={m.type}
                    width={Math.round(tile * 0.75)}
                    className="rounded-t-[11px]"
                  />
                  <span className="block px-2 py-1 text-xs font-semibold text-ocean-900/70">
                    <span className="mr-1 rounded bg-sand-100 px-1 py-0.5 text-[10px] font-bold uppercase">
                      {mediaSourceLabel(m.url)}
                    </span>
                    {isPlaceholderMedia(m.url, m.title) && (
                      <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">
                        placeholder
                      </span>
                    )}
                    {mediaTitle(m.url, m.type, m.title)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMedia(m)}
                  className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ocean-700 shadow-sm"
                >
                  Preview
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {previewMedia && (
        <MediaLightbox
          media={previewMedia}
          usageRefs={usageByUrl[previewMedia.url] ?? []}
          onClose={() => setPreviewMedia(null)}
        />
      )}

      {confirmUsed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <p className="font-bold text-ocean-900">Used in playlists, campaigns, or history</p>
            <p className="mt-2 text-sm text-ocean-900/70">
              {confirmUsed.urls.length} item(s) still appear on a property timeline,
              campaign, or publish history. Remove anyway strips those references and
              moves the asset to trash.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-sm">
              {confirmUsed.refs.slice(0, 12).map((r) => (
                <li key={`${r.propertyId}-${r.playlist}-${r.detail ?? ""}`}>
                  {formatMediaUsageRef(r)}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeUrls(confirmUsed.urls, true)}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Remove anyway
              </button>
              <button
                type="button"
                onClick={() => setConfirmUsed(null)}
                className="rounded-full bg-sand-200 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
