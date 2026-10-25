/* VIPERLOOP — service worker: офлайн-кэш + автообновление */
const CACHE = "viperloop-v1";
const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "vendor/three.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("viperloop-") && k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Навигация: сначала сеть (чтобы ловить обновления), кэш — как офлайн-план
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        try {
          const net = await fetch(req);
          c.put("./", net.clone());
          return net;
        } catch {
          return (await c.match(req)) || (await c.match("./")) || (await c.match("index.html"));
        }
      })()
    );
    return;
  }

  // Остальные ресурсы: кэш-first + докачка и сохранение в кэш
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const net = await fetch(req);
      if (net.ok && (req.url.startsWith(self.location.origin) || net.type === "basic")) {
        c.put(req, net.clone());
      }
      return net;
    })()
  );
});
