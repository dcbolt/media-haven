/**
 * Shared TV service-worker fetch rules — loaded by public/tv-sw.js via importScripts.
 * Keep in sync with lib/tv-sw-policy.ts (smoke tests both).
 */
(function (global) {
  function tvSwShouldSkipFetch(pathname, method) {
    if (method !== "GET") return true;
    if (pathname === "/tv-sw.js") return true;
    if (pathname.startsWith("/api/")) return true;
    return false;
  }

  function tvSwHandlesFetch(pathname, method) {
    if (tvSwShouldSkipFetch(pathname, method)) return false;
    return (
      pathname === "/tv" ||
      pathname.startsWith("/_next/static/") ||
      pathname === "/manifest.webmanifest"
    );
  }

  function tvShellCachePrefix() {
    return "fh-tv-shell-";
  }

  global.__FH_TV_SW_POLICY = {
    tvSwShouldSkipFetch,
    tvSwHandlesFetch,
    tvShellCachePrefix,
  };
})(typeof self !== "undefined" ? self : globalThis);
