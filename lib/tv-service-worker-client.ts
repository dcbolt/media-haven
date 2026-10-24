/** Same as `TV_DEVICE_STORAGE_KEY` in lib/tv-device-id.ts */
const TV_DEVICE_STORAGE_KEY = "fh_tv_device";
/** Same as `tvShellCachePrefix()` in lib/tv-sw-policy.ts */
const TV_SHELL_CACHE_PREFIX = "fh-tv-shell-";

type CacheStorageLike = Pick<CacheStorage, "keys" | "delete">;

export async function deleteTvShellCaches(
  cachesApi: CacheStorageLike | null =
    typeof caches !== "undefined" ? caches : null
): Promise<number> {
  if (!cachesApi) return 0;
  const keys = await cachesApi.keys();
  let n = 0;
  const prefix = TV_SHELL_CACHE_PREFIX;
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      await cachesApi.delete(key);
      n += 1;
    }
  }
  return n;
}

export async function unregisterAllServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
}

type CookieDocument = { cookie: string };

/** Legacy installers used path=/ — clear only that cookie; keep path=/tv device id (F-954). */
export function clearLegacyDeviceCookie(
  doc: CookieDocument | null =
    typeof document !== "undefined" ? document : null
): void {
  if (!doc) return;
  try {
    doc.cookie = `${TV_DEVICE_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export type TvSwBootstrapResult = "off" | "register";

export type TvSwBootstrapDeps = {
  localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  clearLegacyDeviceCookie?: () => void;
  unregisterAllServiceWorkers?: () => Promise<void>;
  deleteTvShellCaches?: () => Promise<number>;
};

/** URL-flag + kill-switch handling extracted from /tv page (F-954 tests). */
export async function applyTvServiceWorkerBootstrap(
  search: string,
  deps: TvSwBootstrapDeps
): Promise<TvSwBootstrapResult> {
  const swFlag = applyServiceWorkerUrlFlags(search);
  if (swFlag === "on") {
    try {
      deps.localStorage.removeItem("fh_tv_sw_off");
    } catch {
      /* ignore */
    }
    deps.clearLegacyDeviceCookie?.();
  }
  if (swFlag === "off") {
    try {
      deps.localStorage.setItem("fh_tv_sw_off", "1");
    } catch {
      /* ignore */
    }
  }
  let off = swFlag === "off";
  if (!off) {
    try {
      off = deps.localStorage.getItem("fh_tv_sw_off") === "1";
    } catch {
      /* ignore */
    }
  }
  if (off) {
    await deps.unregisterAllServiceWorkers?.();
    await deps.deleteTvShellCaches?.();
    return "off";
  }
  return "register";
}

export function applyServiceWorkerUrlFlags(search: string): "off" | "on" | null {
  const params = new URLSearchParams(search);
  if (params.get("no-sw") === "1") return "off";
  if (params.get("sw") === "1") return "on";
  return null;
}
