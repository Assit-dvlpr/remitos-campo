// Guarda la app en el celular para que abra sin señal. Solo archivos propios:
// el login de Microsoft y SharePoint siempre van por la red.
const VERSION = 'remitos-campo-1.0.3';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'img/logo_alonger.jpg', 'img/alo.jpg',
  'vendor/msal-browser-4.30.0.min.js',
  'js/app.js', 'js/config.js', 'js/auth.js', 'js/graph.js', 'js/demo.js', 'js/excel.js',
  'js/pdf.js', 'js/cola.js', 'js/fotos.js', 'js/tecnico.js', 'js/revisor.js', 'js/setup.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para tomar actualizaciones); sin señal, lo guardado.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
