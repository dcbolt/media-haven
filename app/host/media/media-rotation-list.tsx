"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScreensaverMediaItem } from "@/lib/screensaver-media-info";
import { driveViewUrl } from "@/lib/screensaver-media-info";
import MediaThumbnail from "./media-thumbnail";

function formatBytes(n?: number): string | null {
  if (n == null || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAdded(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type RotationResponse = {
  error?: string;
  ok?: boolean;
  deleted?: string[];
  errors?: { url: string; error: string }[];
  partial?: boolean;
  batchUrls?: string[];
  batchDigest?: string;
  batchCount?: number;
  blobCount?: number;
  supabaseCount?: number;
  count?: number;
};

async function rotationAction(body: Record<string, unknown>) {
  const res = await fetch("/api/host/media/rotation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as RotationResponse;
  if (!res.ok) {
    throw new Error(data.error ?? `${res.status}`);
  }
  return data;
}

function bulkConfirmLabel(preview: RotationResponse): string {
  const n = preview.batchCount ?? preview.batchUrls?.length ?? 0;
  const parts: string[] = [];
  if ((preview.blobCount ?? 0) > 0) {
    parts.push(
      `${preview.blobCount} Vercel Blob upload${preview.blobCount === 1 ? "" : "s"}`
    );
  }
  if ((preview.supabaseCount ?? 0) > 0) {
    parts.push(
      `${preview.supabaseCount} Supabase file${preview.supabaseCount === 1 ? "" : "s"}`
    );
  }
  const what = parts.length ? parts.join(" and ") : "stored files";
  return `Delete ${n} too-large item${n === 1 ? "" : "s"} (${what})? This permanently removes ${what} from storage. Up to ${n} per batch.`;
}

function PreviewModal({
  item,
  onClose,
}: {
  item: ScreensaverMediaItem;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const size = formatBytes(item.bytes);
  const added = formatAdded(item.addedAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        open
        aria-labelledby="media-preview-title"
        className="m-0 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl"
      >
        <div className="border-b border-sand-200 px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="media-preview-title"
                className="truncate text-lg font-bold text-ocean-700"
              >
                {item.name}
              </h2>
              <p className="mt-0.5 text-sm text-ocean-900/70">
                {item.sourceLabel} · {item.type}
                {item.hiddenFromRotation ? " · hidden from rotation" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 shrink-0 rounded-full bg-sand-100 px-3 text-sm font-semibold text-ocean-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="bg-ocean-900/5 p-4 sm:p-6">
          {item.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.url}
              alt={item.name}
              className="mx-auto max-h-[50vh] w-full rounded-xl object-contain"
            />
          ) : (
            <video
              src={item.url}
              controls
              muted
              playsInline
              className="mx-auto max-h-[50vh] w-full rounded-xl bg-black"
            />
          )}
        </div>
        <dl className="grid gap-2 px-4 py-4 text-sm sm:grid-cols-2 sm:px-6 sm:pb-6">
          {size && (
            <>
              <dt className="font-semibold text-ocean-700">File size</dt>
              <dd className="text-ocean-900/80">{size}</dd>
            </>
          )}
          {added && (
            <>
              <dt className="font-semibold text-ocean-700">Date added</dt>
              <dd className="text-ocean-900/80">{added}</dd>
            </>
          )}
          {item.tooLargeForTv && (
            <>
              <dt className="font-semibold text-amber-800">TV playback</dt>
              <dd className="font-semibold text-amber-900">
                Too large for TVs — not in rotation
              </dd>
            </>
          )}
        </dl>
      </dialog>
    </div>
  );
}

function MediaRow({
  item,
  busy,
  onPreview,
  onMutate,
  setBusy,
  onError,
}: {
  item: ScreensaverMediaItem;
  busy: boolean;
  onPreview: () => void;
  onMutate: () => void;
  setBusy: (v: boolean) => void;
  onError: (message: string) => void;
}) {
  const [copyOk, setCopyOk] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      setCopyOk(false);
    }
  }

  async function onDeleteOrHide() {
    if (item.hideable) {
      if (
        !window.confirm(
          `Hide “${item.name}” from TV rotation? The file stays in Google Drive.`
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        await rotationAction({
          action: "hide",
          url: item.url,
          confirmed: true,
        });
        onMutate();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Hide failed");
      } finally {
        setBusy(false);
      }
    } else if (item.deletable) {
      if (
        !window.confirm(
          `Delete “${item.name}” permanently? This removes the stored file and takes it out of rotation.`
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        await rotationAction({
          action: "delete",
          url: item.url,
          confirmed: true,
        });
        onMutate();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    }
  }

  async function onUnhide() {
    if (
      !window.confirm(`Show “${item.name}” in TV rotation again?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      await rotationAction({
        action: "unhide",
        url: item.url,
        confirmed: true,
      });
      onMutate();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unhide failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-xl bg-white p-3 shadow-sm ${
        item.hiddenFromRotation ? "opacity-75 ring-2 ring-dashed ring-ocean-300" : ""
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onPreview}
          className="flex min-h-11 flex-1 items-center gap-3 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500"
        >
          <MediaThumbnail item={item} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ocean-800">
              {item.name}
            </span>
            <span className="mt-0.5 block text-xs text-ocean-900/60">
              {item.sourceLabel}
              {formatBytes(item.bytes) ? ` · ${formatBytes(item.bytes)}` : ""}
            </span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-col sm:items-end">
          <span className="rounded-full bg-ocean-100 px-3 py-1 text-sm font-semibold text-ocean-700">
            {item.type}
          </span>
          {item.tooLargeForTv && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
              too large for TVs
            </span>
          )}
          {item.hiddenFromRotation && (
            <span className="rounded-full bg-ocean-200 px-2 py-0.5 text-xs font-bold text-ocean-900">
              hidden
            </span>
          )}
          {item.protectedStandby && (
            <span className="rounded-full bg-seafoam-100 px-2 py-0.5 text-xs font-bold text-ocean-900">
              default standby
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="min-h-11 rounded-full border border-ocean-300 px-4 py-2 text-sm font-semibold text-ocean-700"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="min-h-11 rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ocean-800"
        >
          {copyOk ? "Copied" : "Copy URL"}
        </button>
        {item.driveFileId && (
          <a
            href={driveViewUrl(item.driveFileId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-full border border-sand-300 px-4 py-2 text-sm font-semibold text-ocean-800"
          >
            Open in Drive
          </a>
        )}
        {item.hiddenFromRotation ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onUnhide()}
            className="min-h-11 rounded-full bg-seafoam-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Unhide
          </button>
        ) : item.deletable || item.hideable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onDeleteOrHide()}
            className="min-h-11 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {item.hideable ? "Hide" : "Delete"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function MediaRotationList({
  items,
}: {
  items: ScreensaverMediaItem[];
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<ScreensaverMediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  const inRotation = useMemo(
    () => items.filter((i) => !i.tooLargeForTv && !i.hiddenFromRotation),
    [items]
  );
  const oversizedUploads = useMemo(
    () => items.filter((i) => i.tooLargeForTv && i.deletable),
    [items]
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  async function bulkDeleteOversized() {
    if (oversizedUploads.length === 0) return;
    setActionError(null);
    setBulkNotice(null);
    setBusy(true);
    try {
      const preview = await rotationAction({
        action: "bulk-delete-oversized-preview",
      });
      const batch = preview.batchUrls ?? [];
      if (batch.length === 0) {
        setActionError("Nothing to delete in this batch.");
        return;
      }
      if (!window.confirm(bulkConfirmLabel(preview))) return;
      const result = await rotationAction({
        action: "bulk-delete-oversized",
        confirmed: true,
        bulkCount: batch.length,
        bulkDigest: preview.batchDigest,
        bulkUrls: batch,
      });
      if (result.partial && result.errors?.length) {
        setBulkNotice(
          `Deleted ${result.deleted?.length ?? 0}; ${result.errors.length} failed — see details below.`
        );
        setActionError(
          result.errors.map((e) => `${e.url}: ${e.error}`).join("\n")
        );
      } else if (result.errors?.length) {
        setActionError(
          result.errors.map((e) => `${e.url}: ${e.error}`).join("\n")
        );
      } else {
        setBulkNotice(`Deleted ${result.deleted?.length ?? 0} file(s).`);
      }
      refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setBusy(false);
    }
  }

  const tooLargeCount = items.filter((i) => i.tooLargeForTv).length;

  return (
    <>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ocean-900/70">
          Tap a row to preview. Uploads can be deleted; Google Drive items can
          only be hidden from rotation.
        </p>
        {oversizedUploads.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkDeleteOversized()}
            className="min-h-11 shrink-0 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Remove too-large uploads ({oversizedUploads.length})
          </button>
        )}
      </div>
      {bulkNotice && (
        <p className="mt-2 text-sm font-semibold text-seafoam-600">{bulkNotice}</p>
      )}
      {actionError && (
        <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </pre>
      )}
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <MediaRow
            key={item.url}
            item={item}
            busy={busy}
            onPreview={() => setPreview(item)}
            onMutate={refresh}
            setBusy={setBusy}
            onError={setActionError}
          />
        ))}
        {items.length === 0 && (
          <li className="text-ocean-900/60">
            Nothing yet — TVs show a black standby screen with a clock.
          </li>
        )}
      </ul>
      {preview && (
        <PreviewModal item={preview} onClose={() => setPreview(null)} />
      )}
      <p className="sr-only" aria-live="polite">
        {inRotation.length} in rotation
        {tooLargeCount > 0 ? `, ${tooLargeCount} too large for TVs` : ""}
      </p>
    </>
  );
}
