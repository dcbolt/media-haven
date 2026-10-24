import { TV_DEVICE_STORAGE_KEY } from "./tv-device-id";
import { tvShellCachePrefix } from "./tv-sw-policy";

export async function deleteTvShellCaches(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  const keys = await caches.keys();
  let n = 0;
  const prefix = tvShellCachePrefix();
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      await caches.delete(key);
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

/** Legacy installers used path=/ — clear so /tv-scoped cookie wins. */
export function clearLegacyDeviceCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${TV_DEVICE_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${TV_DEVICE_STORAGE_KEY}=; path=/tv; max-age=0; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

export function applyServiceWorkerUrlFlags(search: string): "off" | "on" | null {
  const params = new URLSearchParams(search);
  if (params.get("no-sw") === "1") return "off";
  if (params.get("sw") === "1") return "on";
  return null;
}
