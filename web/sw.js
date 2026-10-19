// Version: v2026-10-19T12182
<<<<<<< HEAD

=======
// Version: v2026-10-19T12153
>>>>>>> origin/main
// sw.js – minimalny Service Worker (tylko instalacja PWA, bez offline cache)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));