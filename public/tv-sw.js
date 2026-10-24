/**
 * TV offline shell — scope /tv only. Registered as /tv-sw.js?rev=<build>.
 * Kill switch: ?no-sw=1 or localStorage fh_tv_sw_off=1 (page unregisters).
 */
/* eslint-disable no-restricted-globals */

const SW_URL = new URL(self.location.href);
const BUILD_REV = SW_URL.searchParams.get("rev") || "1";
const CACHE = `fh-tv-shell-${BUILD_REV}`;

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>The Florida Havens — TV</title>
<style>
  html,body{margin:0;height:100%;background:#12333f;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem}
  h1{font-family:Georgia,serif;font-size:clamp(2rem,6vw,3.5rem);font-weight:500}
  p{opacity:.85;font-size:clamp(1rem,2.5vw,1.35rem);max-width:36rem;margin:1rem auto 0}
</style></head><body>
<h1>The Florida Havens</h1>
<p>Signage is offline. Wi‑Fi or our server will come back — no power cycle needed.</p>
</body></html>`;

function offlineShellResponse() {
  return new Response(OFFLINE_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add("/tv").catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("fh-tv-shell-") && k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/tv-sw.js") return;
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const hit =
            (await caches.match(event.request)) ||
            (await caches.match("/tv"));
          return hit || offlineShellResponse();
        })
    );
    return;
  }

  if (!isStaticAsset(url.pathname) && url.pathname !== "/manifest.webmanifest") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        return hit || offlineShellResponse();
      })
  );
});
