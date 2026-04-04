const CACHE_NAME = "yahtzee-cabin-v16";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=19",
  "./app.js?v=19",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isAppAsset = APP_ASSETS.some((asset) => requestUrl.pathname.endsWith(asset.replace("./", "/"))) || requestUrl.pathname.endsWith("/yahtzee/") || requestUrl.pathname.endsWith("/yahtzee");

  event.respondWith(
    (isAppAsset
      ? fetch(event.request)
          .then((networkResponse) => {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return networkResponse;
          })
          .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match("./index.html")))
      : caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request)
            .then((networkResponse) => {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
              return networkResponse;
            })
            .catch(() => caches.match("./index.html"));
        })),
  );
});