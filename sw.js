const CACHE = "pixel-save-v1";

// Assets to pre-cache on install so the app works offline
const PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
  "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap",
  "https://unpkg.com/@tailwindcss/browser@4",
  "https://unpkg.com/react@18.3.1/umd/react.development.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
  "https://unpkg.com/framer-motion@11.11.17/dist/framer-motion.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Use individual fetches so one failing CDN doesn't break the whole install
      Promise.allSettled(PRECACHE.map((url) => c.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Only handle GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // For the HTML page: network-first so updates are picked up, fall back to cache offline
  if (url.pathname === "/" || url.pathname === "/index.html") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // For everything else (CDN scripts, fonts, icons): cache-first
  e.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
    )
  );
});
