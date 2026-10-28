/** Stable TV device handle — shared by /tv identity, report API, and smoke fixtures. */

export const TV_DEVICE_STORAGE_KEY = "fh_tv_device";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Canonical uuid for server keys / lookups (trim + lowercase). */
export function canonicalDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!UUID_RE.test(s)) return null;
  return s;
}

export function deviceIdForLog(raw: unknown): string {
  return canonicalDeviceId(raw) ?? "invalid";
}

export function readPersistedDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TV_DEVICE_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  if (!raw) {
    try {
      raw = sessionStorage.getItem(TV_DEVICE_STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
  }
  if (!raw) {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${TV_DEVICE_STORAGE_KEY}=([^;]*)`)
    );
    if (match?.[1]) {
      try {
        raw = decodeURIComponent(match[1]);
      } catch {
        raw = match[1];
      }
    }
  }
  return raw ? canonicalDeviceId(raw) : null;
}

export function persistDeviceId(value: string): void {
  const id = canonicalDeviceId(value) ?? value;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TV_DEVICE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(TV_DEVICE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${TV_DEVICE_STORAGE_KEY}=${encodeURIComponent(id)}; path=/tv; max-age=63072000; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

export function deviceIdFromUrl(search: string): string | null {
  const fromUrl = new URLSearchParams(search).get("device");
  return canonicalDeviceId(fromUrl);
}

/** Whether ?device= on this URL should bind storage (first pair or ?repair=1). */
export function urlDeviceMayBind(
  search: string,
  existing: string | null
): boolean {
  const fromUrl = deviceIdFromUrl(search);
  if (!fromUrl) return false;
  if (new URLSearchParams(search).get("repair") === "1") return true;
  return !existing;
}

/** URL device id applies on first pair or explicit ?repair=1 re-pair (F-888). */
export function resolveDeviceId(search: string, mint: () => string): string {
  const fromUrl = deviceIdFromUrl(search);
  const existing = readPersistedDeviceId();

  if (fromUrl && urlDeviceMayBind(search, existing)) {
    persistDeviceId(fromUrl);
    return fromUrl;
  }
  if (existing) return existing;
  const id = canonicalDeviceId(mint()) ?? mint();
  persistDeviceId(id);
  return id;
}
