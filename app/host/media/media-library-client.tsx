"use client";

import { useCallback, useRef, useState } from "react";
import MediaLibraryPanel from "@/app/host/signage/media-library-panel";
import type { MediaAsset } from "@/app/host/signage/editor";
import type { MediaUsageRef } from "@/lib/media-usage";
import MediaThumb from "./media-thumb";
import UploadForm from "./upload-form";

function isExpired(expiresAt?: string | null, now = Date.now()): boolean {
  if (!expiresAt) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    const end = Date.parse(`${expiresAt}T23:59:59.999Z`);
    return Number.isFinite(end) && end < now;
  }
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}

export default function MediaLibraryClient({
  initialPool,
  usageByUrl: initialUsage,
  knownTags: initialTags,
}: {
  initialPool: MediaAsset[];
  usageByUrl: Record<string, MediaUsageRef[]>;
  knownTags: string[];
}) {
  const [pool, setPool] = useState(initialPool);
  const [usageByUrl, setUsageByUrl] = useState(initialUsage);
  const [knownTags, setKnownTags] = useState(initialTags);
  const [metaLocal] = useState<Record<string, Partial<MediaAsset>>>({});
  const [healthState, setHealthState] = useState("idle");
  const [healthBroken, setHealthBroken] = useState<Set<string>>();
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshPool = useCallback(async () => {
    const res = await fetch("/api/host/media/pool", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      pool: MediaAsset[];
      usageByUrl: Record<string, MediaUsageRef[]>;
      knownTags: string[];
    };
    setPool(data.pool);
    setUsageByUrl(data.usageByUrl);
    setKnownTags(data.knownTags);
  }, []);

  async function checkHealth() {
    setHealthState("checking");
    try {
      const urls = pool.map((m) => m.url);
      const res = await fetch("/api/host/media/health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = (await res.json()) as { broken?: string[] };
      setHealthBroken(new Set(data.broken ?? []));
    } finally {
      setHealthState("done");
    }
  }

  return (
    <>
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-md">
        <UploadForm onUploaded={() => void refreshPool()} />
      </section>

      <MediaLibraryPanel
        pool={pool}
        timelineUrls={new Set()}
        usageByUrl={usageByUrl}
        knownTags={knownTags}
        tile={176}
        fileHover={false}
        onFileHover={() => {}}
        onDropFiles={() => {}}
        onUploadClick={() => fileInput.current?.click()}
        onCheckHealth={() => void checkHealth()}
        healthState={healthState}
        healthBroken={healthBroken}
        uploads={[]}
        onInsertMedia={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        dragActive={false}
        MediaThumb={MediaThumb}
        isExpired={isExpired}
        metaLocal={metaLocal}
        onEditMeta={() => {}}
        onPoolRefresh={() => void refreshPool()}
        previewOnClick
        showUpload={false}
      />
    </>
  );
}
