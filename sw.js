// Version: v2026-05-13T10224
// sw.js – minimalny Service Worker (tylko instalacja PWA, bez offline cache)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));