// Service worker: guarda o app para funcionar sem internet.
// Estratégia "rede primeiro": com internet, sempre pega a versão mais nova;
// sem internet, usa a cópia guardada.

const CACHE = 'geotag-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'professor.html',
  'manifest.json',
  'icone.svg',
  'css/estilo.css',
  'js/config.js',
  'js/protocolo.js',
  'js/geo.js',
  'js/cripto.js',
  'js/ble.js',
  'js/jogo.js',
  'js/professor.js',
  'gabarito.enc',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  );
});
