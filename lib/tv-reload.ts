/**
 * Never reload the TV into a dead document. A blind reload during a network
 * outage leaves UniFi Connect / Fully on the browser error page with no JS.
 */

export const TV_MAX_AUTO_RELOADS = 3;
const RELOAD_COUNT_KEY = "fh_tv_auto_reload_count";

/** Budgeted: failed-poll / nightly self-heal. Exempt: deploy, host force, error recovery. */
export type TvReloadKind = "budgeted" | "exempt";

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

/** Mark host force-reload stamp only after reload is actually issued (F-897). */
export function markForceReloadHandled(
  forceReloadAt: string,
  reloaded: boolean
): void {
  if (!reloaded) return;
  const ss = tvSessionStorage();
  if (!ss) return;
  try {
    ss.setItem(`fh_force_reload_${forceReloadAt}`, "1");
  } catch {
    /* private mode */
  }
}

export function forceReloadAlreadyHandled(forceReloadAt: string): boolean {
  const ss = tvSessionStorage();
  if (!ss) return false;
  try {
    return Boolean(ss.getItem(`fh_force_reload_${forceReloadAt}`));
  } catch {
    return false;
  }
}

/** Returns true when a full reload was started. */
export async function reloadTvIfReachable(
  deviceId: string | null,
  previewProperty: string | null,
  opts?: { manual?: boolean; kind?: TvReloadKind }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const kind: TvReloadKind =
    opts?.kind ?? (opts?.manual ? "exempt" : "budgeted");
  if (!consumeReloadBudgetIfNeeded(kind)) return false;
  const ok = await probeTvStateReachable(deviceId, previewProperty);
  if (!ok) return false;
  if (kind === "budgeted") recordTvAutoReload();
  window.location.reload();
  return true;
}

/** Budget gate — exempt reloads never touch the counter; budget increments only after probe OK. */
export function consumeReloadBudgetIfNeeded(kind: TvReloadKind): boolean {
  if (kind === "budgeted" && !canAutoReloadTv()) return false;
  return true;
}

/** Successful state poll — clears the budgeted auto-reload counter (F-952). */
export function onTvStatePollSuccess(): void {
  resetTvAutoReloadCount();
}

/** Failed-poll path issues a budgeted reload (probe + record on success). */
export async function tvPollFailedReloadAttempt(
  deviceId: string | null,
  previewProperty: string | null
): Promise<boolean> {
  return reloadTvIfReachable(deviceId, previewProperty, { kind: "budgeted" });
}

/** Host force-reload stamp — only persisted after reload actually issued. */
export function tvAckForceReload(forceReloadAt: string, reloaded: boolean): void {
  markForceReloadHandled(forceReloadAt, reloaded);
}

/** @internal smoke — budget increment without navigation. */
export function tvRecordBudgetedReloadForTest(): void {
  recordTvAutoReload();
}
