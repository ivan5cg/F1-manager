// Service worker de la PWA: shell mínimo en caché al instalar, red primero para HTML/manifest
// y caché primero para assets estáticos con hash, modelos .glb, texturas, HDRI y entornos.
// Cada versión publicada tiene su propia caché (main.ts/pwa.ts registra «sw.js?v=<versión>»):
// al activarse una nueva se borran las anteriores.
const CACHE = "muro-" + (new URL(self.location.href).searchParams.get("v") || "v2");
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icono-192.png"];
const STATIC_RE = /\/assets\/|\.(?:js|css|glb|webp|hdr|wasm|woff2?|png|svg|json)$/i;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => { /* no bloquear la instalación si un recurso de respaldo falla */ })
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("muro-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

function networkFirst(req) {
  return fetch(req)
    .then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return r;
    })
    .catch(() => caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => hit || (req.mode === "navigate" ? c.match("./index.html") : undefined))
    ));
}

function cacheFirst(req) {
  return caches.open(CACHE).then((c) =>
    c.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); c.put(req, copy); }
      return r;
    }))
  );
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  const isNav = e.request.mode === "navigate" || p.endsWith("/") || p.endsWith("/index.html") || p.endsWith("/manifest.webmanifest") || p.endsWith("/manifest.json");
  if (isNav) { e.respondWith(networkFirst(e.request)); return; }
  if (STATIC_RE.test(p)) { e.respondWith(cacheFirst(e.request)); return; }
  e.respondWith(networkFirst(e.request));
});
