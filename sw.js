// Putting Yard — offline service worker.
// Strategy matters here: the app page is fetched network-first so a new
// deploy shows up on the very next launch, with the cache as the offline
// fallback. Icons and fonts stay cache-first since they rarely change.

const CACHE = "putting-yard-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // take over immediately rather than waiting for every tab to close
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

const isPage = (req) =>
  req.mode === "navigate" ||
  req.destination === "document" ||
  new URL(req.url).pathname.endsWith("index.html");

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

  // the app itself: try the network first, fall back to cache when offline
  if (isPage(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  // everything else: cache first, refresh in the background
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const live = fetch(e.request)
        .then((res) => {
          const cacheable = res && ((res.status === 200 && res.type === "basic") || (isFont && (res.ok || res.type === "opaque")));
          if (cacheable) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});
