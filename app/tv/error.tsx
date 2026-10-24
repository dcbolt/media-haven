"use client";

import { useEffect, useState } from "react";
import { readLastGoodState } from "@/lib/tv-client-cache";
import { readPersistedDeviceId, deviceIdFromUrl } from "@/lib/tv-device-id";
import {
  canAutoReloadTv,
  reloadTvIfReachable,
  resetTvAutoReloadCount,
} from "@/lib/tv-reload";
import type { TvState } from "@/lib/tv";

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

/**
 * Client render errors must not white-screen the fleet. Hydrate from the
 * last-good cache when possible; capped auto-reload with backoff (F-881).
 */
export default function TvError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [cached, setCached] = useState<TvState | null>(null);
  const [reloadsExhausted, setReloadsExhausted] = useState(false);

  useEffect(() => {
    setCached(readLastGoodState());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (!canAutoReloadTv()) {
        setReloadsExhausted(true);
        return;
      }
      const search = window.location.search;
      const deviceId = deviceIdFromUrl(search) ?? readPersistedDeviceId();
      const previewProperty = new URLSearchParams(search).get("property");
      const reloaded = await reloadTvIfReachable(deviceId, previewProperty);
      if (reloaded || cancelled) return;
      if (!canAutoReloadTv()) {
        setReloadsExhausted(true);
        return;
      }
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      timer = window.setTimeout(tick, delay);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
        {reloadsExhausted
          ? "Showing last saved screen. Use Try again when the network is back."
          : "Showing saved content when available. Reconnecting with backoff — no power cycle needed."}
      </p>
      <button
        type="button"
        className="mt-[2vw] rounded-[1vw] bg-white/15 px-[3vw] py-[1.2vw] text-[1.6vw] font-semibold text-white"
        onClick={() => {
          reset();
          resetTvAutoReloadCount();
          setReloadsExhausted(false);
          const search = window.location.search;
          void reloadTvIfReachable(
            deviceIdFromUrl(search) ?? readPersistedDeviceId(),
            new URLSearchParams(search).get("property"),
            { manual: true }
          );
        }}
      >
        Try again
      </button>
    </div>
  );
}
