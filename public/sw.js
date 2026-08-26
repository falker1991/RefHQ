const CACHE = "law18referee-v0.41.1";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/owner-documents/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (new URL(event.request.url).pathname === "/version.json") {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  const request = event.request.mode === "navigate"
    ? new Request(event.request, { cache: "no-store" })
    : event.request;
  event.respondWith(fetch(request).then((response) => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request.mode === "navigate" ? "/" : event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((response) => response || caches.match("/"))));
});
