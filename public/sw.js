/*
 * FocusLog service worker.
 * - Makes FocusLog installable and opens a friendly page when you're offline.
 * - Shows timer notifications and brings the app to the front when you tap one.
 * Data is never cached: your timer and stats always come live from the server.
 */
const VERSION = "v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// Pages: always from the network; only if that fails, show the offline page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

// Tapping "Focus complete" brings FocusLog to the front (or opens it on the timer).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus();
      return self.clients.openWindow("/timer");
    })(),
  );
});
