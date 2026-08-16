/* Service worker voor Siems Dierenlogboek.
 * Versie-gebaseerde cache: elke build krijgt een nieuwe cache-naam, oude
 * caches worden bij activate opgeruimd. skipWaiting + clients.claim zorgen
 * dat een nieuwe versie direct actief wordt en nooit blijft hangen. */
const VERSION = "msw2672y";
const BASE = "/dierenlogboek/";
const CACHE = "dierenlogboek-" + VERSION;
const FONT_CACHE = "dierenlogboek-fonts";
const PRECACHE = [
  "/dierenlogboek/assets/index-Cf05VYgr.css",
  "/dierenlogboek/assets/index-DlOwP-bS.js",
  "/dierenlogboek/assets/index.esm-CyIkSDdc.js",
  "/dierenlogboek/assets/index.esm-DnoN5pbu.js",
  "/dierenlogboek/assets/index.esm2017-Cp8kYHkS.js",
  "/dierenlogboek/icons/apple-touch-icon.png",
  "/dierenlogboek/icons/icon-192.png",
  "/dierenlogboek/icons/icon-512.png",
  "/dierenlogboek/index.html",
  "/dierenlogboek/manifest.webmanifest",
  "/dierenlogboek/"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("dierenlogboek-") && k !== CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Google Fonts: cache-first met achtergrondverversing, zodat de app-fonts
  // ook offline in het veld werken.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetched = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigaties: network-first zodat een nieuwe versie meteen wordt opgepikt,
  // met cache-fallback voor offline gebruik.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(BASE + "index.html").then((res) => res || caches.match(BASE))
      )
    );
    return;
  }

  // Statische assets (gehasht door Vite): cache-first.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
