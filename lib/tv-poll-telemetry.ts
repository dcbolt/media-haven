/**
 * Optional TV poll query params (ignored by server if unmapped — no schema change).
 */

type PerformanceMemory = {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
};

function readPerformanceMemory(): PerformanceMemory | null {
  if (typeof performance === "undefined") return null;
  const mem = (performance as Performance & { memory?: PerformanceMemory })
    .memory;
  if (!mem || typeof mem.usedJSHeapSize !== "number") return null;
  return mem;
}

/** Append to `/api/tv/state?...` — uptime + Chrome heap when available. */
export function tvPollTelemetryQuerySuffix(): string {
  const parts: string[] = [];
  if (typeof performance !== "undefined") {
    parts.push(`uptime_s=${Math.max(0, Math.floor(performance.now() / 1000))}`);
  }
  const mem = readPerformanceMemory();
  if (mem?.usedJSHeapSize != null) {
    parts.push(`heap_used=${mem.usedJSHeapSize}`);
    if (mem.totalJSHeapSize != null) {
      parts.push(`heap_total=${mem.totalJSHeapSize}`);
    }
    if (mem.jsHeapSizeLimit != null) {
      parts.push(`heap_limit=${mem.jsHeapSizeLimit}`);
    }
  }
  return parts.length ? `&${parts.join("&")}` : "";
}
