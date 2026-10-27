const CACHE = "sneaky-confessions-v1";
const PRECACHE = ["/favicon.png", "/pwa-192.png", "/pwa-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function store(request, response) {
  if (!response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy));
  return response;
}

function offline() {
  return new Response(
    '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
      '<title>Offline</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;' +
      'background:#0e0b14;color:#eee;font-family:system-ui,sans-serif;text-align:center">' +
      '<div><p style="font-size:3rem;margin:0">👻</p><h1 style="font-size:1.1rem">You\'re offline</h1>' +
      '<p style="color:#999;font-size:.85rem">Reconnect to hear the latest secrets.</p></div></body>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/")) ?? offline()),
    );
    return;
  }

  // Hashed build output never changes, so serve it from cache after the first hit.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((r) => store(request, r))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => store(request, response))
        .catch(() => hit);
      return hit ?? network;
    }),
  );
});
