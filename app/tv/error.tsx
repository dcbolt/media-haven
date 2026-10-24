"use client";

import { useEffect, useState } from "react";
import { readLastGoodState } from "@/lib/tv-client-cache";
import {
  deviceIdFromUrl,
  readPersistedDeviceId,
} from "@/lib/tv-device-id";
import { reloadTvIfReachable } from "@/lib/tv-reload";
import type { TvState } from "@/lib/tv";

/**
 * Client render errors must not white-screen the fleet. Hydrate from the
 * last-good cache when possible and keep probing for a safe reload.
 */
export default function TvError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [cached, setCached] = useState<TvState | null>(null);

  useEffect(() => {
    setCached(readLastGoodState());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const search =
        typeof window !== "undefined" ? window.location.search : "";
      const deviceId =
        deviceIdFromUrl(search) ?? readPersistedDeviceId();
      const previewProperty = new URLSearchParams(search).get("property");
      const reloaded = await reloadTvIfReachable(deviceId, previewProperty);
      if (!reloaded && !cancelled) {
        window.setTimeout(tick, 30_000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, []);

  const name =
    cached && (cached.mode === "demo" || cached.mode === "active")
      ? cached.content.propertyName
      : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vw] bg-ocean-900 px-[6vw] text-center text-white">
      <h1 className="font-serif text-[5vw] font-medium tracking-wide">
        The Florida Havens
      </h1>
      {name ? (
        <p className="text-[2vw] text-white/80">
          {name} — signage paused briefly
        </p>
      ) : (
        <p className="text-[2vw] text-white/80">Signage paused briefly</p>
      )}
      <p className="max-w-[70vw] text-[1.5vw] text-white/60">
        Showing saved content when available. Reconnecting automatically — no
        power cycle needed.
      </p>
      <button
        type="button"
        className="mt-[2vw] rounded-[1vw] bg-white/15 px-[3vw] py-[1.2vw] text-[1.6vw] font-semibold text-white"
        onClick={() => {
          reset();
          const search = window.location.search;
          void reloadTvIfReachable(
            deviceIdFromUrl(search) ?? readPersistedDeviceId(),
            new URLSearchParams(search).get("property")
          );
        }}
      >
        Try again
      </button>
    </div>
  );
}
