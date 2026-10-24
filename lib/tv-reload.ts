/**
 * Never reload the TV into a dead document. A blind reload during a network
 * outage leaves UniFi Connect / Fully on the browser error page with no JS.
 */

export const TV_MAX_AUTO_RELOADS = 3;
const RELOAD_COUNT_KEY = "fh_tv_auto_reload_count";

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

function tvSessionStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
    const g = globalThis as typeof globalThis & { sessionStorage?: Storage };
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function getTvAutoReloadCount(): number {
  const ss = tvSessionStorage();
  if (!ss) return 0;
  try {
    return Number(ss.getItem(RELOAD_COUNT_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function recordTvAutoReload(): void {
  const ss = tvSessionStorage();
  if (!ss) return;
  try {
    ss.setItem(RELOAD_COUNT_KEY, String(getTvAutoReloadCount() + 1));
  } catch {
    /* ignore */
  }
}

export function resetTvAutoReloadCount(): void {
  const ss = tvSessionStorage();
  if (!ss) return;
  try {
    ss.removeItem(RELOAD_COUNT_KEY);
  } catch {
    /* ignore */
  }
}

export function canAutoReloadTv(): boolean {
  return getTvAutoReloadCount() < TV_MAX_AUTO_RELOADS;
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Reachable only on HTTP 200 — redirects must not trigger reload (F-883). */
export async function probeTvStateReachable(
  deviceId: string | null,
  previewProperty: string | null,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  const url = tvStateProbeUrl(deviceId, previewProperty);
  if (!url) return false;
  try {
    const res = await fetchImpl(url, {
      cache: "no-store",
      method: "GET",
      redirect: "manual",
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Returns true when a full reload was started. Auto reloads capped at 3/session. */
export async function reloadTvIfReachable(
  deviceId: string | null,
  previewProperty: string | null,
  opts?: { manual?: boolean }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!opts?.manual && !canAutoReloadTv()) return false;
  const ok = await probeTvStateReachable(deviceId, previewProperty);
  if (!ok) return false;
  if (!opts?.manual) recordTvAutoReload();
  window.location.reload();
  return true;
}
