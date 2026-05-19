const CACHE = "pixel-save-v2"; // bumped: fixes CDN opaque-response caching bug

const LOCAL_ASSETS = ["/", "/index.html", "/manifest.json", "/icon.svg"];

const CDN_ASSETS = [
  "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap",
  "https://unpkg.com/@tailwindcss/browser@4",
  "https://unpkg.com/react@18.3.1/umd/react.development.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
  "https://unpkg.com/framer-motion@11.11.17/dist/framer-motion.js",
];

// Always fetch CDN resources with explicit CORS so we get a real (non-opaque)
// response that can be inspected (res.ok) and stored in the Cache API.
// <script src> tags make no-cors requests which give opaque responses (status 0)
// that can never be cached — re-fetching with cors avoids this entirely.
function corsFetch(url) {
  return fetch(url, { mode: "cors", credentials: "omit" });
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // Same-origin files: must succeed or install fails
    await cache.addAll(LOCAL_ASSETS);

    // CDN files: best-effort — don't break install if a CDN is slow,
    // the fetch handler will cache them on first real use instead
    await Promise.allSettled(CDN_ASSETS.map(async (url) => {
      try {
        const res = await corsFetch(url);
        if (res.ok) await cache.put(url, res);
      } catch { /* will be cached on first network hit */ }
    }));

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // Delete old caches from previous versions
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = request.url;
  const isLocal = url.startsWith(self.location.origin);
  // Catch font binary files that Google Fonts CSS references at runtime
  const isCDN = CDN_ASSETS.some((cdn) => url.startsWith(cdn)) ||
                url.includes("fonts.gstatic.com");

  // HTML navigation: network-first so deploys are picked up, cache as fallback
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(url, res.clone()));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // CDN/external resources: cache-first using URL string key (avoids Request
  // mode mismatch between the no-cors page request and our stored cors response),
  // then CORS-fetch + store on miss
  if (isCDN || !isLocal) {
    e.respondWith((async () => {
      const cached = await caches.match(url);
      if (cached) return cached;
      try {
        const res = await corsFetch(url);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(url, res.clone());
        }
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // Local static assets (icons, manifest, etc.): cache-first
  e.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })
    )
  );
});
