"use client";

import { useEffect, useRef } from "react";

/** Batched, fail-silent slide impression beacons (5 min + loop wrap). */
export function useTvSlideImpressions(opts: {
  deviceId: string | null;
  propertySlug: string | null;
  slideKey: string | null;
  enabled: boolean;
  isTest?: boolean;
}) {
  const { deviceId, propertySlug, slideKey, enabled, isTest = false } = opts;
  const accumRef = useRef<
    Map<string, { showCount: number; secondsOnScreen: number }>
  >(new Map());
  const slideEnteredAt = useRef<number | null>(null);
  const lastSlide = useRef<string | null>(null);
  const loopStartSlide = useRef<string | null>(null);

  const flush = useRef(async (reason: "interval" | "loop" | "unload") => {
    if (!enabled || !deviceId || !propertySlug) return;
    const rows = [...accumRef.current.entries()].map(([slideId, v]) => ({
      slideId,
      showCount: v.showCount,
      secondsOnScreen: Math.round(v.secondsOnScreen),
    }));
    if (rows.length === 0) return;
    accumRef.current.clear();
    try {
      await fetch("/api/tv/impressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId,
          propertySlug,
          isTest,
          reason,
          rows,
        }),
        keepalive: reason === "unload",
      });
    } catch {
      /* fail-silent */
    }
  });

  useEffect(() => {
    flush.current = async (reason) => {
      if (!enabled || !deviceId || !propertySlug) return;
      const rows = [...accumRef.current.entries()].map(([slideId, v]) => ({
        slideId,
        showCount: v.showCount,
        secondsOnScreen: Math.round(v.secondsOnScreen),
      }));
      if (rows.length === 0) return;
      accumRef.current.clear();
      try {
        await fetch("/api/tv/impressions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deviceId,
            propertySlug,
            isTest,
            reason,
            rows,
          }),
          keepalive: reason === "unload",
        });
      } catch {
        /* fail-silent */
      }
    };
  }, [deviceId, propertySlug, enabled, isTest]);

  useEffect(() => {
    if (!enabled || !slideKey) return;
    const now = performance.now();
  if (lastSlide.current && slideEnteredAt.current != null) {
      const sec = (now - slideEnteredAt.current) / 1000;
      const prev = lastSlide.current;
      const hit = accumRef.current.get(prev) ?? {
        showCount: 0,
        secondsOnScreen: 0,
      };
      hit.secondsOnScreen += sec;
      accumRef.current.set(prev, hit);
    }
    const hit = accumRef.current.get(slideKey) ?? {
      showCount: 0,
      secondsOnScreen: 0,
    };
    hit.showCount += 1;
    accumRef.current.set(slideKey, hit);
    lastSlide.current = slideKey;
    slideEnteredAt.current = now;
    if (loopStartSlide.current == null) loopStartSlide.current = slideKey;
    else if (slideKey === loopStartSlide.current && hit.showCount > 1) {
      void flush.current("loop");
    }
  }, [slideKey, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => void flush.current("interval"), 5 * 60_000);
    const onHide = () => void flush.current("unload");
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener("pagehide", onHide);
      void flush.current("unload");
    };
  }, [enabled]);
}