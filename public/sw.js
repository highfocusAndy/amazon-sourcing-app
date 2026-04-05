/* Minimal service worker — enables “Install app” / PWA installability on Chromium; app stays network-first. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Required for Chromium PWA install checks; always network (no offline cache). */
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
