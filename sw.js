// Guarda la app en el celular para que abra sin señal. Solo archivos propios:
// el login de Microsoft y SharePoint siempre van por la red.
const VERSION = 'remitos-campo-1.5.10';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'img/logo_alonger.jpg', 'img/alo.jpg',
  'vendor/msal-browser-4.30.0.min.js',
  'js/app.js',
  'js/nucleo/config.js', 'js/nucleo/constantes.js', 'js/nucleo/estado.js', 'js/nucleo/fechas.js', 'js/nucleo/ids.js', 'js/nucleo/texto.js',
  'js/dominio/catalogo.js', 'js/dominio/extras.js', 'js/dominio/planilla.js', 'js/dominio/remito.js',
  'js/dominio/sistema.js', 'js/dominio/materiales.js', 'js/dominio/intermedia.js',
  'js/datos/contrato.js', 'js/datos/cola.js', 'js/datos/demo.js', 'js/datos/sistema.js', 'js/datos/intermedia.js',
  'js/datos/dataverse/tablas.js', 'js/datos/dataverse/mapeo.js', 'js/datos/dataverse/lectura.js',
  'js/datos/dataverse/api.js', 'js/datos/dataverse/demo.js', 'js/datos/dataverse/escritura.js',
  'js/datos/sharepoint/api.js', 'js/datos/sharepoint/http.js', 'js/datos/sharepoint/sitio.js',
  'js/datos/sharepoint/listas.js', 'js/datos/sharepoint/archivos.js', 'js/datos/sharepoint/excel.js',
  'js/auth/auth.js', 'js/medios/fotos.js', 'js/medios/pdf.js',
  'js/ui/dom.js', 'js/ui/navegacion.js',
  'js/ui/componentes/servicios.js', 'js/ui/componentes/extras.js', 'js/ui/componentes/estado-remito.js', 'js/ui/componentes/materiales.js',
  'js/ui/vistas/tecnico/inicio.js', 'js/ui/vistas/tecnico/nuevo.js', 'js/ui/vistas/tecnico/mis-remitos.js',
  'js/ui/vistas/revisor/lista.js', 'js/ui/vistas/revisor/detalle.js',
  'js/ui/vistas/config/configuracion.js', 'js/ui/vistas/config/clientes.js', 'js/ui/vistas/config/sistema.js',
];

self.addEventListener('install', e => {
  // 'reload': la copia para usar sin señal se arma con lo que está publicado, no con la caché del navegador
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para tomar actualizaciones); sin señal, lo guardado.
// 'no-cache' obliga a consultar al servidor aunque el navegador tenga una copia reciente.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
