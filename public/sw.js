// Service worker mínimo: guarda lo visitado para jugar sin conexión (primero la red, si no, la caché).
// Cada versión publicada tiene su propia caché (main.ts registra «sw.js?v=<versión>»): al activarse
// una nueva se borran las anteriores, que si no se quedaban para siempre con los archivos viejos
// (cada compilación les cambia el nombre).
const CACHE = "muro-" + (new URL(self.location.href).searchParams.get("v") || "v2");
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("muro-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        // solo respuestas buenas: un error del servidor no debe pisar la copia que funcionaba
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
