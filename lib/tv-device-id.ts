/** Stable TV device handle — shared by /tv identity + smoke fixtures. */

export const TV_DEVICE_STORAGE_KEY = "fh_tv_device";

export function readPersistedDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ls = localStorage.getItem(TV_DEVICE_STORAGE_KEY);
    if (ls) return ls;
  } catch {
    /* storage blocked */
  }
  try {
    const ss = sessionStorage.getItem(TV_DEVICE_STORAGE_KEY);
    if (ss) return ss;
  } catch {
    /* storage blocked */
  }
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TV_DEVICE_STORAGE_KEY}=([^;]*)`)
  );
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return null;
}

export function persistDeviceId(value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TV_DEVICE_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(TV_DEVICE_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${TV_DEVICE_STORAGE_KEY}=${encodeURIComponent(value)}; path=/; max-age=63072000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function deviceIdFromUrl(search: string): string | null {
  const fromUrl = new URLSearchParams(search).get("device")?.trim();
  return fromUrl || null;
}
