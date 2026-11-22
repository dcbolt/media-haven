"use client";

import { useEffect, useRef, useState } from "react";

/** Scaled same-origin /tv iframe for fleet tiles (never a guest screenshot). */
export default function TvPreviewThumbnail({
  propertyId,
  title,
  offline,
}: {
  propertyId: string;
  title: string;
  offline: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 1920);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="relative aspect-video w-full overflow-hidden bg-black">
      <iframe
        src={`/tv?property=${propertyId}`}
        title={title}
        loading="lazy"
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
      {offline && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-bold uppercase tracking-wider text-amber-300">
          offline
        </span>
      )}
    </div>
  );
}