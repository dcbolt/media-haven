/**
 * Never reload the TV into a dead document. A blind reload during a network
 * outage leaves UniFi Connect / Fully on the browser error page with no JS.
 */

export function tvStateProbeUrl(
  deviceId: string | null,
  previewProperty: string | null
): string | null {
  if (previewProperty) {
    return `/api/tv/state?property=${encodeURIComponent(previewProperty)}`;
  }
  if (deviceId) {
    return `/api/tv/state?device=${encodeURIComponent(deviceId)}`;
  }
  return null;
}

/** Returns true when a full reload was started (probe returned 200). */
export async function reloadTvIfReachable(
  deviceId: string | null,
  previewProperty: string | null
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = tvStateProbeUrl(deviceId, previewProperty);
  if (!url) return false;
  try {
    const res = await fetch(url, { cache: "no-store", method: "GET" });
    if (res.ok) {
      window.location.reload();
      return true;
    }
  } catch {
    /* offline — keep showing last-good content */
  }
  return false;
}
