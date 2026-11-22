/**
 * UniFi external captive portal query params (transient — never persisted).
 * Pilot SSID: DUNES GUEST / TheDunes-Guest → The Dunes.
 */

export type UniFiPortalParams = {
  clientMac: string | null;
  apMac: string | null;
  ssid: string | null;
  redirectUrl: string | null;
};

export type WifiPropertyPilot = {
  slug: string;
  name: string;
};

const SSID_TO_PROPERTY: Record<string, WifiPropertyPilot> = {
  "dunes guest": { slug: "dunes", name: "The Dunes" },
  "thedunes-guest": { slug: "dunes", name: "The Dunes" },
  "the dunes-guest": { slug: "dunes", name: "The Dunes" },
};

export function parseUniFiPortalParams(
  searchParams: URLSearchParams
): UniFiPortalParams {
  const clientMac =
    searchParams.get("id")?.trim() ||
    searchParams.get("mac")?.trim() ||
    null;
  const apMac = searchParams.get("ap")?.trim() || null;
  const ssid = searchParams.get("ssid")?.trim() || null;
  const redirectUrl = searchParams.get("url")?.trim() || null;
  return { clientMac, apMac, ssid, redirectUrl };
}

export function propertyForSsid(ssid: string | null): WifiPropertyPilot {
  if (!ssid) return { slug: "dunes", name: "The Dunes" };
  const key = ssid.trim().toLowerCase();
  return SSID_TO_PROPERTY[key] ?? { slug: "dunes", name: "The Dunes" };
}

export type PortalMode = "normal" | "open" | "closed";

export function portalModeFromEnv(): PortalMode {
  const v = (process.env.PORTAL_MODE ?? "normal").trim().toLowerCase();
  if (v === "open" || v === "closed") return v;
  return "normal";
}

/** Safe redirect after authorization — blocks open redirects. */
export function safePortalRedirect(
  redirectUrl: string | null,
  fallback: string
): string {
  if (!redirectUrl) return fallback;
  try {
    const u = new URL(redirectUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}