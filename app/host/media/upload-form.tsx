"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

export default function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; pct: number }
    | { kind: "done"; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setStatus({ kind: "uploading", pct: 0 });
    try {
      const blob = await upload(`screensavers/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        onUploadProgress: ({ percentage }) =>
          setStatus({ kind: "uploading", pct: Math.round(percentage) }),
      });
      setStatus({ kind: "done", url: blob.url });
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
      <button
        type="submit"
        disabled={status.kind === "uploading"}
        className="rounded-full bg-ocean-500 px-8 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50"
      >
        {status.kind === "uploading" ? `Uploading… ${status.pct}%` : "Upload"}
      </button>
      {status.kind === "done" && (
        <div className="rounded-xl border-2 border-seafoam-500 bg-white p-4">
          <p className="font-semibold text-ocean-700">
            Uploaded — it&apos;s in the screensaver rotation now.
          </p>
          <p className="mt-1 break-all font-mono text-sm text-ocean-900/70">
            {status.url}
          </p>
          <p className="mt-2 text-sm text-ocean-900/60">
            Preview it on any TV at <span className="font-mono">/tv?preview=standby</span>
          </p>
        </div>
      )}
      {status.kind === "error" && (
        <p className="font-semibold text-red-600">{status.message}</p>
      )}
    </form>
  );
}
