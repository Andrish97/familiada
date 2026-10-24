// Service worker tylko do instalacji panelu admina. Nie zapisuje stron ani danych offline.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
