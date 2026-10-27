"use client";

import { useState } from "react";
import type { ScreensaverMediaItem } from "@/lib/screensaver-media-info";

function FallbackIcon({ type }: { type: "image" | "video" }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-ocean-900/15 text-ocean-700"
      aria-hidden
    >
      {type === "video" ? (
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current opacity-70">
          <path d="M8 5v14l11-7L8 5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current opacity-70">
          <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 1.8V8.7L8.5 10.5v3z" />
        </svg>
      )}
    </div>
  );
}

export default function MediaThumbnail({
  item,
  className = "",
}: {
  item: Pick<ScreensaverMediaItem, "url" | "type" | "name">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const videoSrc =
    item.type === "video" && !failed
      ? `${item.url}${item.url.includes("#") ? "" : "#t=0.1"}`
      : item.url;

  return (
    <span
      className={`relative block h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ocean-900/10 ring-1 ring-black/5 sm:h-20 sm:w-32 ${className}`}
    >
      {failed ? (
        <FallbackIcon type={item.type} />
      ) : item.type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          src={videoSrc}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
