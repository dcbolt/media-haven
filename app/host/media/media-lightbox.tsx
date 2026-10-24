"use client";

import { useEffect, useState } from "react";
import type { MediaUsageRef } from "@/lib/media-usage";
import { mediaSourceLabel } from "@/lib/media-library";

export type LightboxMedia = {
  url: string;
  type: "image" | "video";
  title?: string | null;
  sizeBytes?: number | null;
};

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(
      new URL(url).pathname.split("/").filter(Boolean).pop() ?? url
    );
  } catch {
    return url;
  }
}

function formatBytes(n?: number | null): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaLightbox({
  media,
  usageRefs,
  onClose,
}: {
  media: LightboxMedia;
  usageRefs: MediaUsageRef[];
  onClose: () => void;
}) {
  const [dims, setDims] = useState<string>("—");

  useEffect(() => {
    setDims("—");
    if (media.type === "image") {
      const img = new Image();
      img.onload = () => {
        setDims(`${img.naturalWidth} × ${img.naturalHeight}`);
      };
      img.src = media.url;
    } else {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        setDims(`${v.videoWidth} × ${v.videoHeight}`);
      };
      v.src = media.url;
    }
  }, [media.url, media.type]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = media.title?.trim() || fileNameFromUrl(media.url);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 sm:p-8"
      role="dialog"
      aria-modal
      aria-label="Media preview"
      onClick={onClose}
    >
      <div
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-ocean-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-4">
          {media.type === "video" ? (
            <video
              src={media.url}
              controls
              playsInline
              className="max-h-[70vh] max-w-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt=""
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>
        <div className="border-t border-white/10 bg-ocean-900 px-5 py-4 text-sm text-white">
          <p className="text-lg font-semibold">{name}</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-white/50">Type</dt>
              <dd className="font-medium capitalize">{media.type}</dd>
            </div>
            <div>
              <dt className="text-white/50">Source</dt>
              <dd className="font-medium">{mediaSourceLabel(media.url)}</dd>
            </div>
            <div>
              <dt className="text-white/50">File size</dt>
              <dd>{formatBytes(media.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-white/50">Dimensions</dt>
              <dd>{dims}</dd>
            </div>
          </dl>
          {usageRefs.length > 0 && (
            <div className="mt-3">
              <p className="text-white/50">Used in</p>
              <ul className="mt-1 list-disc pl-5 text-white/90">
                {usageRefs.map((r) => (
                  <li key={`${r.propertyId}-${r.playlist}`}>
                    {r.propertyName} · {r.playlist} playlist
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-full bg-white/15 px-4 py-2 font-semibold hover:bg-white/25"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
