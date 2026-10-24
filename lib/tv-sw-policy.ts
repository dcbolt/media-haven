/** Pure rules mirrored by public/tv-sw.js — tested without a real SW runtime. */

export function tvSwHandlesFetch(pathname: string, method = "GET"): boolean {
  if (method !== "GET") return false;
  if (pathname === "/tv-sw.js") return false;
  if (pathname.startsWith("/api/")) return false;
  return (
    pathname === "/tv" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/manifest.webmanifest"
  );
}

export function tvSwIsNavigationShellPath(pathname: string): boolean {
  return pathname === "/tv";
}

/** Service worker network fetches for TV state probes use manual redirects. */
export const TV_STATE_PROBE_FETCH_INIT = {
  cache: "no-store",
  method: "GET",
  redirect: "manual",
} as const;

export function tvShellCachePrefix(): string {
  return "fh-tv-shell-";
}
