/**
 * TV offline shell — scope /tv only (registered from app/tv/page.tsx).
 * Caches the /tv document and static assets on successful loads so a cold
 * start during a brief outage can still boot React and read last-good cache.
 */
const CACHE = "fh-tv-shell-v1";

function cacheable(url) {
  if (url.pathname === "/tv") return true;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/tv"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put("/tv", clone));
          }
          return res;
        })
        .catch(async () => (await caches.match("/tv")) || Response.error())
    );
    return;
  }

  if (!cacheable(url)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        if (url.pathname.startsWith("/_next/static/")) {
          return (await caches.match(event.request.url)) || Response.error();
        }
        throw new Error("offline");
      })
  );
});
