// Version: v2026-10-19T08495
<<<<<<< HEAD

=======
// Version: v2026-10-19T08494
>>>>>>> 50dbdcc0b9 (fix(admin): keep install button visible in toolbar)
// sw.js – minimalny Service Worker (tylko instalacja PWA, bez offline cache)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));