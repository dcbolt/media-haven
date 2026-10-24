"use client";

import { useEffect, useState } from "react";
import { readLastGoodState } from "@/lib/tv-client-cache";
import { readPersistedDeviceId, deviceIdFromUrl } from "@/lib/tv-device-id";
import {
  attemptErrorRecoveryReload,
  canAttemptErrorRecoveryReload,
  errorRecoveryDelayMs,
  errorRecoveryTimings,
  resetErrorRecoveryLog,
} from "@/lib/tv-error-recovery";
import { probeTvStateReachable, resetTvAutoReloadCount } from "@/lib/tv-reload";
import type { TvState } from "@/lib/tv";

/**
 * Client render errors must not white-screen the fleet. Hydrate from the
 * last-good cache when possible; keep probing/reloading without user input.
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
    let attempt = 0;
    let timer: number | undefined;
    const { firstDelayMs } = errorRecoveryTimings();

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      const search = window.location.search;
      const deviceId = deviceIdFromUrl(search) ?? readPersistedDeviceId();
      const previewProperty = new URLSearchParams(search).get("property");
      const now = Date.now();

      if (canAttemptErrorRecoveryReload(now)) {
        const reloaded = await attemptErrorRecoveryReload(
          deviceId,
          previewProperty,
          now
        );
        if (reloaded || cancelled) return;
      } else if (await probeTvStateReachable(deviceId, previewProperty)) {
        /* Server is up but window cap hit — still backoff (F-951). */
      }

      const delay = errorRecoveryDelayMs(attempt);
      attempt += 1;
      schedule(delay);
    };

    schedule(firstDelayMs);

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
        Showing saved content when available. Reconnecting automatically — no
        power cycle needed.
      </p>
      <button
        type="button"
        className="mt-[2vw] rounded-[1vw] bg-white/15 px-[3vw] py-[1.2vw] text-[1.6vw] font-semibold text-white"
        onClick={() => {
          resetErrorRecoveryLog();
          resetTvAutoReloadCount();
          reset();
          const search = window.location.search;
          void attemptErrorRecoveryReload(
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
