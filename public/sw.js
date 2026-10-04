/* ═══════════════════════════════════════════════════════════
   public/sw.js — Empire Command PWA Service Worker
   Cache-first for static assets, network-first for API calls.
═══════════════════════════════════════════════════════════ */

const CACHE_NAME = "empire-v2";

const PRECACHE = [
  "/build",
  "/manav.jpg",
  "/manifest.json",
];

/* ── Install: precache shell ── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

/* ── Activate: clear old caches ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for /api, cache-first for everything else ── */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go network for API routes
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response("offline", { status: 503 })));
    return;
  }

  // Network-first for pages, so a new deploy's HTML (and the bundles it
  // points at) reaches users instead of a stale cached copy.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((c) => c || caches.match("/build")).then((c) => c || new Response("offline", { status: 503 }))));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached || new Response("offline", { status: 503 }));
    })
  );
});
