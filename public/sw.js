// Minimal service worker: makes the app installable. It deliberately caches nothing, so a new
// deploy is never hidden behind a stale copy (the app needs the network to verify photos anyway).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
