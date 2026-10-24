"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import { MAX_TV_VIDEO_BYTES } from "@/lib/media-upload-limits";

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; pct: number }
    | {
        kind: "done";
        url: string;
        listingWarning?: string;
      }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (
      file.type.startsWith("video/") &&
      file.size > MAX_TV_VIDEO_BYTES
    ) {
      setStatus({
        kind: "error",
        message: `Video too large for TVs (max ${Math.floor(MAX_TV_VIDEO_BYTES / (1024 * 1024))} MB). Re-encode at a lower bitrate before uploading.`,
      });
      return;
    }
    setStatus({ kind: "uploading", pct: 0 });
    try {
      const blob = await upload(`screensavers/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        clientPayload: JSON.stringify({
          size: file.size,
          type: file.type,
        }),
        onUploadProgress: ({ percentage }) =>
          setStatus({ kind: "uploading", pct: Math.round(percentage) }),
      });
      let listingWarning: string | undefined;
      try {
        const check = await fetch("/api/host/media/listing-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: blob.url }),
        });
        const data = (await check.json()) as { listed?: boolean };
        if (check.ok && data.listed === false) {
          listingWarning =
            "Upload succeeded but this URL is not in the fresh Blob listing yet. Wait a minute and refresh — if it still missing, check the Vercel Blob store connection.";
        }
      } catch {
        listingWarning =
          "Upload succeeded but listing verification failed — refresh /host/media in a minute.";
      }
      setStatus({ kind: "done", url: blob.url, listingWarning });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "upload failed",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        required
        accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/avif"
        className="block w-full rounded-xl border border-sand-300 bg-white p-3 text-lg file:mr-4 file:rounded-full file:border-0 file:bg-ocean-500 file:px-4 file:py-2 file:font-semibold file:text-white"
      />
      <p className="text-sm text-ocean-900/60">
        Videos must be ≤ {Math.floor(MAX_TV_VIDEO_BYTES / (1024 * 1024))} MB for
        TV playback. Larger files are rejected at upload.
      </p>
      <button
        type="submit"
        disabled={status.kind === "uploading"}
        className="rounded-full bg-ocean-500 px-8 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50"
      >
        {status.kind === "uploading" ? `Uploading… ${status.pct}%` : "Upload"}
      </button>
      {status.kind === "done" && (
        <div
          className={`rounded-xl border-2 p-4 ${
            status.listingWarning
              ? "border-amber-400 bg-amber-50"
              : "border-seafoam-500 bg-white"
          }`}
        >
          <p className="font-semibold text-ocean-700">
            {status.listingWarning
              ? "Uploaded — listing not confirmed yet"
              : "Uploaded — confirmed in screensaver listing"}
          </p>
          {status.listingWarning && (
            <p className="mt-2 text-sm font-semibold text-amber-900">
              {status.listingWarning}
            </p>
          )}
          <p className="mt-1 break-all font-mono text-sm text-ocean-900/70">
            {status.url}
          </p>
          <p className="mt-2 text-sm text-ocean-900/60">
            Preview on any TV at{" "}
            <span className="font-mono">/tv?preview=standby</span>
          </p>
        </div>
      )}
      {status.kind === "error" && (
        <p className="font-semibold text-red-600">{status.message}</p>
      )}
    </form>
  );
}
